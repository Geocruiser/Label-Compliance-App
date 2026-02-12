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
];
