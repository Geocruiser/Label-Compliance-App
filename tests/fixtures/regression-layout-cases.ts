import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants";
import type { BoundingBox, FieldKey, OcrLine, VerificationStatus } from "@/lib/types";

type RegressionLayoutCase = {
  id: string;
  applicationJson: unknown;
  ocrLines: OcrLine[];
  expectedStatuses: Partial<Record<FieldKey, VerificationStatus>>;
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
      government_warning: "Needs Review",
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
];
