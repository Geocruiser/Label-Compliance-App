import type { FieldKey } from "@/lib/types";

export const GOVERNMENT_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const FIELD_LABELS: Record<FieldKey, string> = {
  brand_name: "Brand Name",
  class_type_designation: "Class / Type Designation",
  alcohol_content: "Alcohol Content",
  net_contents: "Net Contents",
  name_address: "Name / Address",
  country_of_origin: "Country of Origin",
  government_warning: "Government Warning",
};

export const FIELD_ORDER: FieldKey[] = [
  "brand_name",
  "class_type_designation",
  "alcohol_content",
  "net_contents",
  "name_address",
  "country_of_origin",
  "government_warning",
];
