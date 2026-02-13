import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants";
import type {
  BoundingBox,
  FieldKey,
  OcrLine,
  OcrToken,
  VerificationStatus,
} from "@/lib/types";

type RegressionLayoutCase = {
  id: string;
  applicationJson: unknown;
  ocrLines: OcrLine[];
  ocrTokens?: OcrToken[];
  expectedStatuses: Partial<Record<FieldKey, VerificationStatus>>;
  expectedEvidence?: Partial<
    Record<
      FieldKey,
      {
        maxAreaRatio?: number;
        maxHeight?: number;
        maxWidth?: number;
        forbiddenSubstring?: string;
        allowedSources?: Array<"word" | "line" | "none">;
      }
    >
  >;
};

const createBox = (row: number): BoundingBox => ({
  x0: 20,
  y0: 20 + (row * 20),
  x1: 720,
  y1: 20 + (row * 20) + 16,
});

const createLine = (text: string, row: number, confidence = 0.95): OcrLine => ({
  text,
  confidence,
  bbox: createBox(row),
});

const createToken = (
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  confidence = 0.95,
): OcrToken => ({
  text,
  confidence,
  bbox: { x0, y0, x1, y1 },
  lineId: null,
});

export const REGRESSION_LAYOUT_CASES: RegressionLayoutCase[] = [
  {
    id: "warning-lowercase-prefix-needs-review",
    applicationJson: {
      cola_application_id: "REG-01",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      createLine(
        GOVERNMENT_WARNING_TEXT.replace("GOVERNMENT WARNING:", "Government Warning:"),
        8,
        0.96,
      ),
    ],
    expectedStatuses: {
      government_warning: "Fail",
    },
  },
  {
    id: "warning-uppercase-prefix-uppercase-body-pass",
    applicationJson: {
      cola_application_id: "REG-07",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      createLine(GOVERNMENT_WARNING_TEXT.toUpperCase(), 8, 0.96),
    ],
    expectedStatuses: {
      government_warning: "Pass",
    },
  },
  {
    id: "warning-common-ocr-typos-pass",
    applicationJson: {
      cola_application_id: "REG-08",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      createLine(
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because ofthe risk of birth defects. (2) Consumption of alcoholic beverages impairs your abiity / to drive a car or operate machinery, and may cause health problems.",
        8,
        0.95,
      ),
    ],
    expectedStatuses: {
      government_warning: "Pass",
    },
  },
  {
    id: "warning-missing-second-clause-marker-pass",
    applicationJson: {
      cola_application_id: "REG-09",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      createLine(
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
        8,
        0.95,
      ),
    ],
    expectedStatuses: {
      government_warning: "Pass",
    },
  },
  {
    id: "distilled-cross-unit-net-contents-needs-review",
    applicationJson: {
      cola_application_id: "REG-02",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("25.36 FL OZ", 3, 0.92),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.95),
    ],
    expectedStatuses: {
      net_contents: "Needs Review",
    },
  },
  {
    id: "high-confidence-alcohol-mismatch-fail",
    applicationJson: {
      cola_application_id: "REG-03",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("80 PROOF", 2, 0.98),
      createLine("750 ML", 3),
      createLine(GOVERNMENT_WARNING_TEXT, 8),
    ],
    expectedStatuses: {
      alcohol_content: "Fail",
    },
  },
  {
    id: "high-confidence-warning-wording-mismatch-fail",
    applicationJson: {
      cola_application_id: "REG-04",
      brand_name: "OLD TOM",
      class_type_designation: "BOURBON",
      alcohol_content: "90 PROOF",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("BOURBON", 1),
      createLine("90 PROOF", 2),
      createLine("750 ML", 3),
      createLine(
        GOVERNMENT_WARNING_TEXT.replace("risk of birth defects", "risk of serious birth defects"),
        8,
        0.98,
      ),
    ],
    expectedStatuses: {
      government_warning: "Fail",
    },
  },
  {
    id: "numeric-net-contents-with-missing-unit-needs-review",
    applicationJson: {
      cola_application_id: "REG-05",
      brand_name: "OLD TOM",
      class_type_designation: "RUM",
      alcohol_content: "40% ALC/VOL",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("OLD TOM", 0),
      createLine("RUM", 1),
      createLine("40% ALC/VOL", 2),
      createLine("750", 3, 0.93),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.92),
    ],
    expectedStatuses: {
      net_contents: "Needs Review",
    },
  },
  {
    id: "brand-detected-with-compact-word-evidence",
    applicationJson: {
      cola_application_id: "REG-06",
      brand_name: "AMALFI COAST",
      class_type_designation: "GIN",
      alcohol_content: "44% ABV (88 PROOF)",
      net_contents: "750 ML",
      bottler_producer_name_address:
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
      is_imported: true,
      country_of_origin_import: "ITALY",
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("ALFI OAST", 0, 0.49),
      createLine("GIN", 1, 0.92),
      createLine("44% ALC./VOL. (88 PROOF)", 2, 0.89),
      createLine("750 ML", 3, 0.88),
      createLine(
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
        4,
        0.92,
      ),
      createLine("PRODUCT OF ITALY", 5, 0.91),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.9),
    ],
    ocrTokens: [
      createToken("AMALFI", 180, 70, 330, 112, 0.92),
      createToken("COAST", 344, 72, 502, 114, 0.91),
      createToken("DISTILLED", 120, 450, 260, 488, 0.93),
      createToken("BOTTLED", 274, 452, 398, 488, 0.94),
      createToken("LUCIANA", 412, 452, 535, 488, 0.89),
      createToken("SPIRITS", 546, 452, 650, 488, 0.9),
      createToken("ITALY", 300, 518, 382, 552, 0.95),
    ],
    expectedStatuses: {
      brand_name: "Needs Review",
      class_type_designation: "Pass",
      name_address: "Pass",
    },
    expectedEvidence: {
      brand_name: {
        maxAreaRatio: 0.09,
        maxHeight: 90,
        maxWidth: 360,
        forbiddenSubstring: "Distilled",
        allowedSources: ["word"],
      },
    },
  },
  {
    id: "brand-does-not-absorb-nearby-class-token",
    applicationJson: {
      cola_application_id: "REG-10",
      brand_name: "AMALFI COAST",
      class_type_designation: "GIN",
      alcohol_content: "44% ABV (88 PROOF)",
      net_contents: "750 ML",
      bottler_producer_name_address:
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
      is_imported: true,
      country_of_origin_import: "ITALY",
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("AMALFI COAST", 0, 0.93),
      createLine("GIN", 1, 0.94),
      createLine("44% ALC./VOL. (88 PROOF)", 2, 0.89),
      createLine("750 ML", 3, 0.9),
      createLine(
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
        4,
        0.92,
      ),
      createLine("PRODUCT OF ITALY", 5, 0.9),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.9),
    ],
    ocrTokens: [
      createToken("AMALFI", 180, 72, 330, 112, 0.93),
      createToken("COAST", 344, 72, 502, 112, 0.92),
      createToken("GIN", 302, 118, 386, 154, 0.94),
      createToken("DISTILLED", 120, 450, 260, 488, 0.93),
      createToken("BOTTLED", 274, 452, 398, 488, 0.94),
    ],
    expectedStatuses: {},
    expectedEvidence: {
      brand_name: {
        maxAreaRatio: 0.09,
        maxHeight: 56,
        maxWidth: 360,
        forbiddenSubstring: "GIN",
        allowedSources: ["word"],
      },
    },
  },
  {
    id: "class-type-prefers-compact-token-over-brand-plus-class",
    applicationJson: {
      cola_application_id: "REG-11",
      brand_name: "AMALFI COAST",
      class_type_designation: "GIN",
      alcohol_content: "44% ABV (88 PROOF)",
      net_contents: "750 ML",
      bottler_producer_name_address:
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
      is_imported: true,
      country_of_origin_import: "ITALY",
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("AMALFI COAST GIN", 0, 0.94),
      createLine("44% ALC./VOL. (88 PROOF)", 2, 0.9),
      createLine("750 ML", 3, 0.9),
      createLine(
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
        4,
        0.92,
      ),
      createLine("PRODUCT OF ITALY", 5, 0.9),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.9),
    ],
    ocrTokens: [
      createToken("AMALFI", 180, 72, 330, 112, 0.94),
      createToken("COAST", 344, 72, 502, 112, 0.93),
      createToken("GIN", 516, 72, 602, 112, 0.95),
      createToken("DISTILLED", 120, 450, 260, 488, 0.93),
      createToken("BOTTLED", 274, 452, 398, 488, 0.94),
    ],
    expectedStatuses: {
      class_type_designation: "Pass",
    },
    expectedEvidence: {
      class_type_designation: {
        maxAreaRatio: 0.05,
        maxWidth: 120,
        forbiddenSubstring: "AMALFI",
        allowedSources: ["word"],
      },
    },
  },
  {
    id: "test7-country-and-class-evidence-stay-compact",
    applicationJson: {
      cola_application_id: "REG-12",
      brand_name: "BARBADOS GOLDEN OAK",
      class_type_designation: "RUM",
      alcohol_content: "40% ALC/VOL",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: true,
      country_of_origin_import: "BARBADOS",
      government_health_warning_required: true,
    },
    ocrLines: [
      {
        text: "BARBADOS GOLDEN OAK",
        confidence: 0.93,
        bbox: { x0: 140, y0: 60, x1: 620, y1: 118 },
      },
      {
        text: "RUM",
        confidence: 0.92,
        bbox: { x0: 300, y0: 140, x1: 380, y1: 188 },
      },
      {
        text: "750 ML",
        confidence: 0.9,
        bbox: { x0: 280, y0: 228, x1: 390, y1: 272 },
      },
      {
        text: "BARBADOS",
        confidence: 0.91,
        bbox: { x0: 260, y0: 520, x1: 470, y1: 566 },
      },
      {
        text: GOVERNMENT_WARNING_TEXT,
        confidence: 0.9,
        bbox: { x0: 60, y0: 760, x1: 720, y1: 860 },
      },
    ],
    ocrTokens: [
      createToken("BARBADOS", 150, 62, 312, 116, 0.93),
      createToken("GOLDEN", 324, 62, 470, 116, 0.92),
      createToken("OAK", 484, 62, 596, 116, 0.92),
      // Simulate token-level localization drift near brand crest.
      createToken("RUM", 560, 70, 606, 108, 0.94),
      createToken("BARBADOS", 266, 522, 466, 566, 0.92),
    ],
    expectedStatuses: {
      class_type_designation: "Pass",
      country_of_origin: "Pass",
    },
    expectedEvidence: {
      class_type_designation: {
        maxAreaRatio: 0.03,
        maxWidth: 120,
        maxHeight: 60,
        allowedSources: ["line"],
      },
      country_of_origin: {
        maxAreaRatio: 0.05,
        maxWidth: 240,
        forbiddenSubstring: "GOLDEN",
        allowedSources: ["word", "line"],
      },
    },
  },
  {
    id: "class-type-avoids-thin-vertical-word-token",
    applicationJson: {
      cola_application_id: "REG-13",
      brand_name: "GOLDEN OAK",
      class_type_designation: "RUM",
      alcohol_content: "40% ALC/VOL",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: true,
      country_of_origin_import: "BARBADOS",
      government_health_warning_required: true,
    },
    ocrLines: [
      {
        text: "GOLDEN OAK",
        confidence: 0.93,
        bbox: { x0: 180, y0: 62, x1: 520, y1: 118 },
      },
      {
        text: "RUM",
        confidence: 0.91,
        bbox: { x0: 308, y0: 140, x1: 388, y1: 188 },
      },
      {
        text: "BARBADOS",
        confidence: 0.9,
        bbox: { x0: 262, y0: 520, x1: 470, y1: 566 },
      },
      {
        text: GOVERNMENT_WARNING_TEXT,
        confidence: 0.9,
        bbox: { x0: 60, y0: 760, x1: 720, y1: 860 },
      },
    ],
    ocrTokens: [
      createToken("GOLDEN", 188, 64, 350, 116, 0.93),
      createToken("OAK", 362, 64, 500, 116, 0.92),
      // Simulate drift: token OCR places RUM on a thin vertical area.
      createToken("RUM", 594, 40, 630, 198, 0.94),
      createToken("BARBADOS", 266, 522, 466, 566, 0.91),
    ],
    expectedStatuses: {},
    expectedEvidence: {
      class_type_designation: {
        maxAreaRatio: 0.08,
        maxWidth: 320,
        maxHeight: 70,
        allowedSources: ["line"],
      },
    },
  },
  {
    id: "class-type-keeps-word-when-line-candidate-is-multiword",
    applicationJson: {
      cola_application_id: "REG-14",
      brand_name: "STEEL HAMMER",
      class_type_designation: "VODKA",
      alcohol_content: "80 PROOF",
      net_contents: "375 ML",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      {
        text: "STEEL HAMMER VODKA",
        confidence: 0.85,
        bbox: { x0: 150, y0: 52, x1: 640, y1: 228 },
      },
      {
        text: "80 PROOF",
        confidence: 0.9,
        bbox: { x0: 150, y0: 250, x1: 290, y1: 300 },
      },
      {
        text: "375 ML",
        confidence: 0.9,
        bbox: { x0: 510, y0: 250, x1: 640, y1: 300 },
      },
      {
        text: GOVERNMENT_WARNING_TEXT,
        confidence: 0.9,
        bbox: { x0: 70, y0: 760, x1: 720, y1: 860 },
      },
    ],
    ocrTokens: [
      createToken("STEEL", 162, 60, 318, 220, 0.85),
      createToken("HAMMER", 326, 60, 500, 220, 0.85),
      // Thin token localization for class value.
      createToken("VODKA", 610, 56, 640, 220, 0.86),
    ],
    expectedStatuses: {
      class_type_designation: "Pass",
    },
    expectedEvidence: {
      class_type_designation: {
        forbiddenSubstring: "STEEL",
        allowedSources: ["word"],
      },
    },
  },
  {
    id: "test2-brand-and-class-avoid-slit-evidence-boxes",
    applicationJson: {
      cola_application_id: "REG-15",
      brand_name: "SUNRISE",
      class_type_designation: "IPA",
      alcohol_content: null,
      net_contents: "12 FL OZ",
      bottler_producer_name_address: null,
      is_imported: false,
      country_of_origin_import: null,
      government_health_warning_required: true,
    },
    ocrLines: [
      {
        text: "SUNRISE IPA",
        confidence: 0.9,
        bbox: { x0: 120, y0: 70, x1: 540, y1: 250 },
      },
      {
        text: "12 FL OZ",
        confidence: 0.9,
        bbox: { x0: 230, y0: 286, x1: 420, y1: 334 },
      },
      {
        text: GOVERNMENT_WARNING_TEXT,
        confidence: 0.9,
        bbox: { x0: 60, y0: 760, x1: 720, y1: 860 },
      },
    ],
    ocrTokens: [
      // Simulate OCR token drift where token boxes collapse into narrow vertical strips.
      createToken("SUNRISE", 332, 76, 360, 242, 0.91),
      createToken("IPA", 365, 82, 392, 246, 0.9),
    ],
    expectedStatuses: {},
    expectedEvidence: {
      brand_name: {
        maxHeight: 130,
        maxWidth: 360,
        allowedSources: ["word", "line"],
      },
      class_type_designation: {
        maxHeight: 120,
        maxWidth: 260,
        allowedSources: ["word", "line"],
      },
    },
  },
  {
    id: "non-warning-fields-are-case-insensitive",
    applicationJson: {
      cola_application_id: "REG-16",
      brand_name: "GOLDEN OAK",
      class_type_designation: "VODKA",
      alcohol_content: "80 PROOF",
      net_contents: "375 ML",
      bottler_producer_name_address: null,
      is_imported: true,
      country_of_origin_import: "BARBADOS",
      government_health_warning_required: true,
    },
    ocrLines: [
      createLine("golden oak", 0, 0.92),
      createLine("vodka", 1, 0.93),
      createLine("80 proof", 2, 0.91),
      createLine("375 ml", 3, 0.9),
      createLine("barbados", 4, 0.91),
      createLine(GOVERNMENT_WARNING_TEXT, 8, 0.92),
    ],
    expectedStatuses: {
      brand_name: "Pass",
      class_type_designation: "Pass",
      country_of_origin: "Pass",
    },
  },
];
