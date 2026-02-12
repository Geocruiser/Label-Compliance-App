import { NextRequest, NextResponse } from "next/server";
import { normalizePaddleOcrResponse } from "@/lib/paddle-normalize";

export const runtime = "nodejs";

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8001/ocr";

const getErrorMessage = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const shape = payload as Record<string, unknown>;
  if (typeof shape.detail === "string") {
    return shape.detail;
  }

  if (typeof shape.error === "string") {
    return shape.error;
  }

  return null;
};

const parseJsonSafely = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Missing required image file." },
        { status: 400 },
      );
    }

    const imageBytes = Buffer.from(await image.arrayBuffer());
    const payload = {
      image_base64: imageBytes.toString("base64"),
      filename: image.name,
      mime_type: image.type,
    };

    const startedAt = performance.now();
    const paddleResponse = await fetch(OCR_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const rawBody = await paddleResponse.text();
    const rawResponse = parseJsonSafely(rawBody);

    if (!paddleResponse.ok) {
      const parsedMessage = getErrorMessage(rawResponse);
      const textMessage = rawBody.trim();
      const message = parsedMessage
        ?? (textMessage.length > 0
          ? `PaddleOCR service request failed: ${textMessage.slice(0, 250)}`
          : "PaddleOCR service request failed.");
      return NextResponse.json({ error: message }, { status: paddleResponse.status });
    }

    if (rawResponse === null) {
      return NextResponse.json(
        { error: "PaddleOCR service returned a non-JSON success payload." },
        { status: 502 },
      );
    }

    const normalized = normalizePaddleOcrResponse(rawResponse);
    normalized.diagnostics.apiRoundTripMs = Math.round(performance.now() - startedAt);
    normalized.diagnostics.totalOcrMs = normalized.diagnostics.apiRoundTripMs;

    return NextResponse.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error
        ? `OCR API route failed: ${error.message}`
        : "OCR API route failed: unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
