import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants";
import type { BoundingBox, FieldKey, OcrLine, VerificationStatus } from "@/lib/types";

type AcceptanceFixture = {
  id: string;
  formPath: string;
  labelPath: string;
  ocrLines: OcrLine[];
  expectedStatuses: Record<FieldKey, VerificationStatus>;
};

const createBox = (row: number): BoundingBox => ({
  x0: 24,
  y0: 24 + (row * 20),
  x1: 700,
  y1: 24 + (row * 20) + 16,
});

const createLine = (text: string, row: number, confidence = 0.95): OcrLine => ({
  text,
  confidence,
  bbox: createBox(row),
});

const addWarningLine = (row: number) => {
  return createLine(GOVERNMENT_WARNING_TEXT, row, 0.94);
};

const PASS_BASE: Record<FieldKey, VerificationStatus> = {
  brand_name: "Pass",
  class_type_designation: "Pass",
  alcohol_content: "Pass",
  net_contents: "Pass",
  name_address: "Pass",
  country_of_origin: "Pass",
  government_warning: "Pass",
};

export const ACCEPTANCE_FIXTURES: AcceptanceFixture[] = [
  {
    id: "test1",
    formPath: "assets/Test Forms/test1_form.json",
    labelPath: "assets/Test Labels/test1.png",
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test2",
    formPath: "assets/Test Forms/test2_form.json",
    labelPath: "assets/Test Labels/test2.png",
    ocrLines: [
      createLine("SUNRISE", 0),
      createLine("IPA", 1),
      createLine("12 FL OZ", 2),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test3",
    formPath: "assets/Test Forms/test3_form.json",
    labelPath: "assets/Test Labels/test3.png",
    ocrLines: [
      createLine("OLD OAK", 0),
      createLine("WHISKEY", 1),
      createLine("80 PROOF", 2),
      createLine("750 ML", 3),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test4",
    formPath: "assets/Test Forms/test4_form.json",
    labelPath: "assets/Test Labels/test4.png",
    ocrLines: [
      createLine("STEEL HAMMER", 0),
      createLine("VODKA", 1),
      createLine("80 PROOF", 2),
      createLine("375 ML", 3),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test5",
    formPath: "assets/Test Forms/test5_form.json",
    labelPath: "assets/Test Labels/test5.png",
    ocrLines: [
      createLine("VINO BELLA", 0),
      createLine("ROSE WINE", 1),
      createLine("11.5% ABV", 2),
      createLine("500 ML", 3),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test6",
    formPath: "assets/Test Forms/test6_form.json",
    labelPath: "assets/Test Labels/test6.png",
    ocrLines: [
      createLine("BLUE LAGOON", 0),
      createLine("RUM", 1),
      createLine("40% ABV", 2),
      createLine("750 ML", 3),
      addWarningLine(8),
    ],
    expectedStatuses: PASS_BASE,
  },
  {
    id: "test7",
    formPath: "assets/Test Forms/test7_form.json",
    labelPath: "assets/Test Labels/test7.png",
    ocrLines: [
      createLine("BARBADOS GOLDEN OAK", 0),
      createLine("RUM", 1),
      createLine("750 ML", 2),
      createLine("BARBADOS", 3),
      addWarningLine(8),
    ],
    expectedStatuses: {
      ...PASS_BASE,
      alcohol_content: "Needs Review",
      name_address: "Needs Review",
    },
  },
  {
    id: "test8",
    formPath: "assets/Test Forms/test8_form.json",
    labelPath: "assets/Test Labels/test8.png",
    ocrLines: [
      createLine("AMALFI COAST", 0),
      createLine("GIN", 1),
      createLine("44% ABV (88 PROOF)", 2),
      createLine("750 ML", 3),
      createLine(
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
        4,
        0.93,
      ),
      createLine("ITALY", 5),
      addWarningLine(10),
    ],
    expectedStatuses: PASS_BASE,
  },
];
