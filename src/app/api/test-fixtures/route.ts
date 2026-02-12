import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FORMS_DIR = path.join(process.cwd(), "assets", "Test Forms");
const LABELS_DIR = path.join(process.cwd(), "assets", "Test Labels");

type FixtureMeta = {
  id: string;
  formFileName: string;
  labelFileName: string;
};

const getMimeTypeForExtension = (extension: string) => {
  const normalized = extension.toLowerCase();
  if (normalized === ".png") {
    return "image/png";
  }
  if (normalized === ".jpg" || normalized === ".jpeg") {
    return "image/jpeg";
  }
  if (normalized === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
};

const getFixtureMetadata = async (): Promise<FixtureMeta[]> => {
  const [formEntries, labelEntries] = await Promise.all([
    fs.readdir(FORMS_DIR, { withFileTypes: true }),
    fs.readdir(LABELS_DIR, { withFileTypes: true }),
  ]);

  const formMap = new Map<string, string>();
  for (const entry of formEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(/^(test\d+)_form\.json$/i);
    if (!match) {
      continue;
    }
    formMap.set(match[1].toLowerCase(), entry.name);
  }

  const labelMap = new Map<string, string>();
  for (const entry of labelEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(/^(test\d+)\.(png|jpg|jpeg|webp)$/i);
    if (!match) {
      continue;
    }
    labelMap.set(match[1].toLowerCase(), entry.name);
  }

  const fixtures: FixtureMeta[] = [];
  for (const [id, formFileName] of formMap.entries()) {
    const labelFileName = labelMap.get(id);
    if (!labelFileName) {
      continue;
    }
    fixtures.push({ id, formFileName, labelFileName });
  }

  fixtures.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  return fixtures;
};

export const GET = async (request: NextRequest) => {
  try {
    const fixtures = await getFixtureMetadata();
    const requestedId = request.nextUrl.searchParams.get("id");

    if (!requestedId) {
      return NextResponse.json({
        fixtures: fixtures.map((fixture) => ({
          id: fixture.id,
          formFileName: fixture.formFileName,
          labelFileName: fixture.labelFileName,
        })),
      });
    }

    const normalizedId = requestedId.toLowerCase();
    const fixture = fixtures.find((candidate) => candidate.id === normalizedId);
    if (!fixture) {
      return NextResponse.json(
        { error: `Unknown fixture id: ${requestedId}` },
        { status: 404 },
      );
    }

    const formPath = path.join(FORMS_DIR, fixture.formFileName);
    const labelPath = path.join(LABELS_DIR, fixture.labelFileName);

    const [formRaw, labelBytes] = await Promise.all([
      fs.readFile(formPath, "utf8"),
      fs.readFile(labelPath),
    ]);
    const formJson = JSON.parse(formRaw) as unknown;
    const labelMimeType = getMimeTypeForExtension(path.extname(fixture.labelFileName));

    return NextResponse.json({
      id: fixture.id,
      formFileName: fixture.formFileName,
      labelFileName: fixture.labelFileName,
      labelMimeType,
      labelBase64: labelBytes.toString("base64"),
      formJson,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `Fixture API failed: ${error.message}`
        : "Fixture API failed: unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
