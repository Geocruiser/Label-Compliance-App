import { NextRequest, NextResponse } from "next/server";
import { normalizeOcrResponse } from "@/lib/ocr-normalize";

export const runtime = "nodejs";

const DATALAB_BASE_URL = process.env.DATALAB_BASE_URL ?? "https://www.datalab.to";
const DATALAB_MARKER_MODE = process.env.DATALAB_MARKER_MODE ?? "balanced";
const DATALAB_MAX_POLL_ATTEMPTS = 30;
const DATALAB_POLL_INTERVAL_MS = 1000;

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

const parseJsonResponse = async (response: Response): Promise<unknown | null> => {
  const body = await response.text();
  return parseJsonSafely(body);
};

const sleep = (durationMs: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const resolveRequestCheckUrl = (requestCheckUrl: string) => {
  try {
    return new URL(requestCheckUrl, DATALAB_BASE_URL).toString();
  } catch {
    return null;
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      return NextResponse.json(
        { error: "DATALAB_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Missing required image file." },
        { status: 400 },
      );
    }

    const startedAt = performance.now();

    const markerFormData = new FormData();
    markerFormData.append("file", image, image.name);
    markerFormData.append("output_format", "json");
    markerFormData.append("mode", DATALAB_MARKER_MODE);

    const markerSubmitResponse = await fetch(`${DATALAB_BASE_URL}/api/v1/marker`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: markerFormData,
      cache: "no-store",
    });

    const markerSubmitPayload = await parseJsonResponse(markerSubmitResponse);
    if (!markerSubmitResponse.ok) {
      const message =
        getErrorMessage(markerSubmitPayload)
        ?? "Datalab Marker submission failed.";
      return NextResponse.json(
        { error: message },
        { status: markerSubmitResponse.status },
      );
    }

    if (!markerSubmitPayload || typeof markerSubmitPayload !== "object") {
      return NextResponse.json(
        { error: "Datalab Marker submission returned an invalid payload." },
        { status: 502 },
      );
    }

    const requestCheckUrlRaw =
      typeof (markerSubmitPayload as Record<string, unknown>).request_check_url ===
      "string"
        ? ((markerSubmitPayload as Record<string, unknown>).request_check_url as string)
        : null;
    if (!requestCheckUrlRaw) {
      return NextResponse.json(
        { error: "Datalab Marker response did not include request_check_url." },
        { status: 502 },
      );
    }

    const requestCheckUrl = resolveRequestCheckUrl(requestCheckUrlRaw);
    if (!requestCheckUrl) {
      return NextResponse.json(
        { error: "Datalab Marker response provided an invalid request_check_url." },
        { status: 502 },
      );
    }

    let markerResultPayload: unknown = null;
    let markerResultStatus = "processing";

    for (let attempt = 0; attempt < DATALAB_MAX_POLL_ATTEMPTS; attempt += 1) {
      const markerResultResponse = await fetch(requestCheckUrl, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
        },
        cache: "no-store",
      });

      markerResultPayload = await parseJsonResponse(markerResultResponse);
      if (!markerResultResponse.ok) {
        const errorMessage =
          getErrorMessage(markerResultPayload)
          ?? "Datalab Marker status check failed.";
        return NextResponse.json(
          { error: errorMessage },
          { status: markerResultResponse.status },
        );
      }

      if (!markerResultPayload || typeof markerResultPayload !== "object") {
        return NextResponse.json(
          { error: "Datalab Marker status check returned an invalid payload." },
          { status: 502 },
        );
      }

      markerResultStatus =
        typeof (markerResultPayload as Record<string, unknown>).status === "string"
          ? String((markerResultPayload as Record<string, unknown>).status)
          : "processing";

      if (markerResultStatus === "complete") {
        const succeeded =
          (markerResultPayload as Record<string, unknown>).success !== false;
        if (!succeeded) {
          const errorMessage =
            getErrorMessage(markerResultPayload)
            ?? "Datalab Marker completed with a failure status.";
          return NextResponse.json({ error: errorMessage }, { status: 502 });
        }
        break;
      }

      if (markerResultStatus === "failed") {
        const errorMessage =
          getErrorMessage(markerResultPayload)
          ?? "Datalab Marker processing failed.";
        return NextResponse.json({ error: errorMessage }, { status: 502 });
      }

      if (attempt === DATALAB_MAX_POLL_ATTEMPTS - 1) {
        return NextResponse.json(
          { error: "Timed out while waiting for Datalab Marker processing." },
          { status: 504 },
        );
      }

      await sleep(DATALAB_POLL_INTERVAL_MS);
    }

    const normalized = normalizeOcrResponse(markerResultPayload);
    normalized.diagnostics.apiRoundTripMs = Math.round(performance.now() - startedAt);
    normalized.diagnostics.totalOcrMs = normalized.diagnostics.apiRoundTripMs;
    if (markerResultStatus !== "complete") {
      normalized.diagnostics.warnings.push(
        "OCR provider did not report complete status before normalization.",
      );
    }

    return NextResponse.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error
        ? `OCR API route failed: ${error.message}`
        : "OCR API route failed: unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
