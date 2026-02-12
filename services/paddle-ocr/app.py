import base64
import re
import time
from io import BytesIO
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from paddleocr import PaddleOCR

WARNING_TEXT_HINTS = re.compile(
    r"(government|warning|surgeon|pregnancy|alcoholic|birth|defect)",
    re.IGNORECASE,
)


class BBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float


class OcrLine(BaseModel):
    text: str
    confidence: float
    bbox: BBox
    line_id: str
    polygon: list[list[float]] | None = None


class OcrToken(BaseModel):
    text: str
    confidence: float
    bbox: BBox
    line_id: str


class OcrDiagnostics(BaseModel):
    model: str
    inference_ms: int
    warnings: list[str]


class OcrRequest(BaseModel):
    image_base64: str
    filename: str | None = None
    mime_type: str | None = None


class OcrResponse(BaseModel):
    lines: list[OcrLine]
    tokens: list[OcrToken]
    diagnostics: OcrDiagnostics


app = FastAPI(title="PaddleOCR Service", version="1.0.0")


def build_ocr_engine() -> PaddleOCR:
    # PaddleOCR argument support can differ across versions. Keep a safe
    # minimal init first, then fallback to alternate key names if needed.
    init_candidates: list[dict[str, Any]] = [
        {
            "use_angle_cls": True,
            "lang": "en",
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        },
        {"use_angle_cls": True, "lang": "en"},
        {"use_textline_orientation": True, "lang": "en"},
    ]

    last_error: Exception | None = None
    for candidate in init_candidates:
        try:
            return PaddleOCR(**candidate)
        except Exception as error:  # noqa: BLE001
            last_error = error
            continue

    if last_error is None:
        raise RuntimeError("Unable to initialize PaddleOCR engine.")

    raise RuntimeError(f"PaddleOCR initialization failed: {last_error}") from last_error


ocr_engine = build_ocr_engine()


def decode_image(image_base64: str) -> np.ndarray:
    try:
        image_bytes = base64.b64decode(image_base64)
        image = Image.open(BytesIO(image_bytes))
        # Keep OCR coordinates in the same orientation as browser rendering.
        image = ImageOps.exif_transpose(image).convert("RGB")
        # Improve OCR on low-contrast, textured label regions (e.g., warning text)
        # without changing image geometry.
        image = ImageEnhance.Contrast(image).enhance(1.35)
        image = image.filter(ImageFilter.SHARPEN)
        return np.array(image)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image payload: {error}") from error


def line_to_bbox(points: list[list[float]]) -> BBox:
    normalized_points = coerce_points(points)
    if len(normalized_points) == 0:
        return BBox(x0=0.0, y0=0.0, x1=0.0, y1=0.0)

    x_values = [point[0] for point in normalized_points]
    y_values = [point[1] for point in normalized_points]
    min_x = float(min(x_values))
    min_y = float(min(y_values))
    max_x = float(max(x_values))
    max_y = float(max(y_values))
    height = max(1.0, max_y - min_y)

    # Slight vertical padding keeps descenders from clipping in line overlays.
    vertical_padding = height * 0.10

    return BBox(
        x0=min_x,
        y0=float(min_y - vertical_padding),
        x1=max_x,
        y1=float(max_y + vertical_padding),
    )


def rotate_bbox_180(bbox: BBox, image_width: int, image_height: int) -> BBox:
    return BBox(
        x0=float(image_width - bbox.x1),
        y0=float(image_height - bbox.y1),
        x1=float(image_width - bbox.x0),
        y1=float(image_height - bbox.y0),
    )


def rotate_polygon_180(
    polygon: list[list[float]] | None,
    image_width: int,
    image_height: int,
) -> list[list[float]] | None:
    if not polygon:
        return None

    rotated_points: list[list[float]] = []
    for point in polygon:
        if len(point) < 2:
            continue
        rotated_points.append(
            [float(image_width - point[0]), float(image_height - point[1])]
        )

    return rotated_points if len(rotated_points) >= 3 else None


def get_center_y(bbox: BBox) -> float:
    return (bbox.y0 + bbox.y1) / 2


def get_center_x(bbox: BBox) -> float:
    return (bbox.x0 + bbox.x1) / 2


def should_rotate_coordinates(lines: list[OcrLine], image_height: int) -> bool:
    if len(lines) == 0:
        return False

    warning_like_centers = [
        get_center_y(line.bbox)
        for line in lines
        if WARNING_TEXT_HINTS.search(line.text)
    ]
    if len(warning_like_centers) == 0:
        return False

    warning_like_centers.sort()
    median_index = len(warning_like_centers) // 2
    median_center_y = warning_like_centers[median_index]
    return median_center_y < (image_height * 0.45)


def sort_lines_reading_order(lines: list[OcrLine]) -> list[OcrLine]:
    sorted_lines = sorted(lines, key=lambda line: get_center_y(line.bbox))
    median_height = 18.0
    if len(sorted_lines) > 0:
        heights = [max(1.0, line.bbox.y1 - line.bbox.y0) for line in sorted_lines]
        heights.sort()
        median_height = heights[len(heights) // 2]
    same_row_threshold = max(8.0, median_height * 0.7)

    row_groups: list[list[OcrLine]] = []
    row_center_y: list[float] = []

    for line in sorted_lines:
        center_y = get_center_y(line.bbox)
        if len(row_groups) == 0:
            row_groups.append([line])
            row_center_y.append(center_y)
            continue

        latest_row_index = len(row_groups) - 1
        latest_center_y = row_center_y[latest_row_index]
        if abs(center_y - latest_center_y) <= same_row_threshold:
            row_groups[latest_row_index].append(line)
            row_count = len(row_groups[latest_row_index])
            row_center_y[latest_row_index] = (
                ((latest_center_y * (row_count - 1)) + center_y) / row_count
            )
            continue

        row_groups.append([line])
        row_center_y.append(center_y)

    ordered_lines: list[OcrLine] = []
    for row in row_groups:
        ordered_lines.extend(sorted(row, key=lambda line: get_center_x(line.bbox)))

    return ordered_lines


def normalize_coordinate_orientation(
    lines: list[OcrLine],
    tokens: list[OcrToken],
    image_width: int,
    image_height: int,
) -> tuple[list[OcrLine], list[OcrToken]]:
    if not should_rotate_coordinates(lines, image_height):
        return sort_lines_reading_order(lines), tokens

    rotated_lines = [
        OcrLine(
            text=line.text,
            confidence=line.confidence,
            bbox=rotate_bbox_180(line.bbox, image_width, image_height),
            line_id=line.line_id,
            polygon=rotate_polygon_180(line.polygon, image_width, image_height),
        )
        for line in lines
    ]
    rotated_tokens = [
        OcrToken(
            text=token.text,
            confidence=token.confidence,
            bbox=rotate_bbox_180(token.bbox, image_width, image_height),
            line_id=token.line_id,
        )
        for token in tokens
    ]

    return sort_lines_reading_order(rotated_lines), rotated_tokens


def split_tokens(
    line_text: str,
    bbox: BBox,
    confidence: float,
    line_id: str,
) -> list[OcrToken]:
    token_matches = list(re.finditer(r"\S+", line_text))
    if len(token_matches) == 0:
        return []

    total_units = max(1, len(line_text))
    width = max(1.0, bbox.x1 - bbox.x0)

    token_results: list[OcrToken] = []
    for token_index, token_match in enumerate(token_matches):
        token = token_match.group(0)
        start_index = token_match.start()
        end_index = token_match.end()
        x0 = bbox.x0 + (width * (start_index / total_units))
        x1 = bbox.x0 + (width * (end_index / total_units))
        if token_index == len(token_matches) - 1:
            x1 = bbox.x1
        x0 = max(bbox.x0, min(bbox.x1, x0))
        x1 = max(x0, min(bbox.x1, x1))
        token_box = BBox(
            x0=x0,
            y0=bbox.y0,
            x1=x1,
            y1=bbox.y1,
        )
        token_results.append(
            OcrToken(
                text=token,
                confidence=confidence,
                bbox=token_box,
                line_id=line_id,
            )
        )

    return token_results


def coerce_points(raw_points: Any) -> list[list[float]]:
    if hasattr(raw_points, "tolist"):
        raw_points = raw_points.tolist()
    if not isinstance(raw_points, list):
        return []

    points: list[list[float]] = []
    for point in raw_points:
        if hasattr(point, "tolist"):
            point = point.tolist()
        if isinstance(point, list) and len(point) >= 2:
            points.append([float(point[0]), float(point[1])])
    return points


def parse_legacy_result(result: list[Any]) -> tuple[list[OcrLine], list[OcrToken]]:
    lines: list[OcrLine] = []
    tokens: list[OcrToken] = []
    if not result or not result[0]:
        return lines, tokens

    for line_index, line_entry in enumerate(result[0]):
        points = line_entry[0]
        text = str(line_entry[1][0]).strip()
        confidence = float(line_entry[1][1] or 0)

        if not text:
            continue

        line_id = f"line_{line_index}"
        normalized_points = coerce_points(points)
        bbox = line_to_bbox(normalized_points)
        line = OcrLine(
            text=text,
            confidence=max(0.0, min(1.0, confidence)),
            bbox=bbox,
            line_id=line_id,
            polygon=normalized_points if len(normalized_points) >= 3 else None,
        )
        lines.append(line)
        tokens.extend(split_tokens(text, bbox, line.confidence, line_id))

    return lines, tokens


def parse_modern_result(result: Any) -> tuple[list[OcrLine], list[OcrToken]]:
    lines: list[OcrLine] = []
    tokens: list[OcrToken] = []

    if isinstance(result, dict):
        records = [result]
    elif isinstance(result, list):
        records = [record for record in result if isinstance(record, dict)]
    else:
        return lines, tokens

    line_index = 0
    for record in records:
        texts = record.get("rec_texts")
        scores = record.get("rec_scores")
        detection_polys = record.get("dt_polys")
        recognition_polys = record.get("rec_polys")

        if not isinstance(texts, list) or not isinstance(scores, list):
            continue

        item_count = min(len(texts), len(scores))
        for item_index in range(item_count):
            text = str(texts[item_index]).strip()
            if len(text) == 0:
                continue

            points: list[list[float]] = []
            if isinstance(detection_polys, list) and item_index < len(detection_polys):
                points = coerce_points(detection_polys[item_index])
            if len(points) < 2 and isinstance(recognition_polys, list) and item_index < len(recognition_polys):
                points = coerce_points(recognition_polys[item_index])
            if len(points) < 2:
                continue

            confidence = float(scores[item_index] or 0)
            line_id = f"line_{line_index}"
            line_index += 1
            bbox = line_to_bbox(points)
            line = OcrLine(
                text=text,
                confidence=max(0.0, min(1.0, confidence)),
                bbox=bbox,
                line_id=line_id,
                polygon=points if len(points) >= 3 else None,
            )
            lines.append(line)
            tokens.extend(split_tokens(text, bbox, line.confidence, line_id))

    return lines, tokens


def parse_result(
    result: Any,
    image_width: int,
    image_height: int,
) -> tuple[list[OcrLine], list[OcrToken]]:
    lines: list[OcrLine] = []
    tokens: list[OcrToken] = []
    if (
        isinstance(result, list)
        and len(result) > 0
        and isinstance(result[0], list)
    ):
        lines, tokens = parse_legacy_result(result)
    else:
        lines, tokens = parse_modern_result(result)

    return normalize_coordinate_orientation(lines, tokens, image_width, image_height)


def run_ocr(image_array: np.ndarray) -> Any:
    try:
        return ocr_engine.ocr(
            image_array,
            cls=True,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    except TypeError as error:
        if "unexpected keyword argument 'use_doc_orientation_classify'" in str(error):
            return ocr_engine.ocr(image_array, cls=True)
        if "unexpected keyword argument 'cls'" in str(error):
            return ocr_engine.ocr(image_array)
        raise


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr", response_model=OcrResponse)
def ocr(request: OcrRequest) -> OcrResponse:
    image_array = decode_image(request.image_base64)
    image_height, image_width = image_array.shape[0], image_array.shape[1]
    start_time = time.perf_counter()
    try:
        raw_result = run_ocr(image_array)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"PaddleOCR inference failed: {error}") from error
    inference_ms = int((time.perf_counter() - start_time) * 1000)

    lines, tokens = parse_result(raw_result, image_width, image_height)
    warnings: list[str] = []
    if len(lines) == 0:
        warnings.append("PaddleOCR returned zero text lines.")

    return OcrResponse(
        lines=lines,
        tokens=tokens,
        diagnostics=OcrDiagnostics(
            model="paddleocr",
            inference_ms=inference_ms,
            warnings=warnings,
        ),
    )
