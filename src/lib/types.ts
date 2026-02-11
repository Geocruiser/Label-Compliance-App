export type VerificationStatus = "Pass" | "Fail" | "Needs Review" | "Missing";

export type FieldKey =
  | "brand_name"
  | "class_type_designation"
  | "alcohol_content"
  | "net_contents"
  | "name_address"
  | "country_of_origin"
  | "government_warning";

export type AlcoholClass = "wine" | "beer" | "distilled_spirits" | "other";

export type BoundingBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: BoundingBox;
};

export type CanonicalApplication = {
  applicationId: string;
  alcoholClass: AlcoholClass;
  isImport: boolean;
  fields: {
    brandName: string | null;
    classTypeDesignation: string | null;
    alcoholContent: string | null;
    netContents: string | null;
    nameAddress: string | null;
    countryOfOrigin: string | null;
    governmentWarningRequired: boolean;
    governmentWarningText: string;
  };
  sourceSchema: "legacy_test_form" | "prd";
};

export type VerificationFieldResult = {
  field: FieldKey;
  label: string;
  applicationValue: string;
  extractedValue: string;
  status: VerificationStatus;
  confidence: number | null;
  reason: string;
  evidenceBox: BoundingBox | null;
};

export type OcrRunDiagnostics = {
  totalOcrMs: number;
  preprocessMs: number;
  preprocessSteps: string[];
  detectionMs: number;
  preprocessedRecognizeMs: number;
  rawRecognizeMs: number;
  selectedPipeline: "preprocessed" | "raw";
  preprocessedLineCount: number;
  rawLineCount: number;
  cleanupApplied: boolean;
  transientArtifactsCleared: string[];
  warnings: string[];
};

export type VerificationResult = {
  fields: VerificationFieldResult[];
  ocrLines: OcrLine[];
  ocrDiagnostics: OcrRunDiagnostics;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};
