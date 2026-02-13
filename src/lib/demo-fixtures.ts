export type FixtureOption = {
  id: string;
  formFileName: string;
  labelFileName: string;
};

export type FixtureLoadPayload = {
  id: string;
  formFileName: string;
  labelFileName: string;
  labelMimeType: string;
  labelBase64: string;
  formJson: unknown;
};

type JsonModule<T> = {
  default: T;
};

type DemoFixtureDescriptor = FixtureOption & {
  loadFixturePayload: () => Promise<JsonModule<FixtureLoadPayload>>;
  loadOcrPayload: () => Promise<JsonModule<unknown>>;
};

const normalizeStem = (value: string) => {
  return value
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

const DEMO_FIXTURES: DemoFixtureDescriptor[] = [
  {
    id: "test1",
    formFileName: "test1_form.json",
    labelFileName: "test1.png",
    loadFixturePayload: () => import("../../assets/Response Data/test1_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test1_ocr_response.json"),
  },
  {
    id: "test2",
    formFileName: "test2_form.json",
    labelFileName: "test2.png",
    loadFixturePayload: () => import("../../assets/Response Data/test2_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test2_ocr_response.json"),
  },
  {
    id: "test3",
    formFileName: "test3_form.json",
    labelFileName: "test3.png",
    loadFixturePayload: () => import("../../assets/Response Data/test3_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test3_ocr_response.json"),
  },
  {
    id: "test4",
    formFileName: "test4_form.json",
    labelFileName: "test4.png",
    loadFixturePayload: () => import("../../assets/Response Data/test4_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test4_ocr_response.json"),
  },
  {
    id: "test5",
    formFileName: "test5_form.json",
    labelFileName: "test5.png",
    loadFixturePayload: () => import("../../assets/Response Data/test5_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test5_ocr_response.json"),
  },
  {
    id: "test6",
    formFileName: "test6_form.json",
    labelFileName: "test6.png",
    loadFixturePayload: () => import("../../assets/Response Data/test6_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test6_ocr_response.json"),
  },
  {
    id: "test7",
    formFileName: "test7_form.json",
    labelFileName: "test7.png",
    loadFixturePayload: () => import("../../assets/Response Data/test7_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test7_ocr_response.json"),
  },
  {
    id: "test8",
    formFileName: "test8_form.json",
    labelFileName: "test8.png",
    loadFixturePayload: () => import("../../assets/Response Data/test8_response.json"),
    loadOcrPayload: () => import("../../assets/Response Data/test8_ocr_response.json"),
  },
];

const DEMO_FIXTURE_BY_ID = new Map(
  DEMO_FIXTURES.map((fixture) => [fixture.id.toLowerCase(), fixture]),
);
const DEMO_FIXTURE_BY_LABEL_STEM = new Map(
  DEMO_FIXTURES.map((fixture) => [normalizeStem(fixture.labelFileName), fixture]),
);

export const listDemoFixtures = (): FixtureOption[] => {
  return DEMO_FIXTURES.map(({ id, formFileName, labelFileName }) => ({
    id,
    formFileName,
    labelFileName,
  }));
};

export const loadDemoFixtureById = async (
  fixtureId: string,
): Promise<FixtureLoadPayload> => {
  const fixture = DEMO_FIXTURE_BY_ID.get(fixtureId.toLowerCase());
  if (!fixture) {
    throw new Error(`Unknown fixture id: ${fixtureId}`);
  }

  const payload = (await fixture.loadFixturePayload()).default;
  return payload;
};

export const loadDemoOcrPayloadForLabel = async (
  labelFileName: string,
): Promise<unknown> => {
  const fixture = DEMO_FIXTURE_BY_LABEL_STEM.get(normalizeStem(labelFileName));
  if (!fixture) {
    throw new Error(
      `No demo OCR response found for "${labelFileName}". Use a built-in demo fixture or switch NEXT_PUBLIC_APP_MODE=api.`,
    );
  }

  return (await fixture.loadOcrPayload()).default;
};

