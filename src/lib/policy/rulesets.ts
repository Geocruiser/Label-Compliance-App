import type { AlcoholClass, FieldKey } from "@/lib/types";

export type FieldRequirementLevel = "required" | "conditional" | "optional";
export type RuleRequirement = FieldRequirementLevel | "manual_review";
export type RuleScope = FieldKey | "cross_field";

export type ExecutablePolicyRule = {
  id: string;
  title: string;
  scope: RuleScope;
  requirement: RuleRequirement;
  summary: string;
  citations: string[];
};

type ClassRuleset = {
  sourceRuleset: string;
  rules: ExecutablePolicyRule[];
};

const DISTILLED_SPIRITS_RULES: ExecutablePolicyRule[] = [
  {
    id: "DS-01",
    title: "Same Field of Vision Core Items",
    scope: "cross_field",
    requirement: "manual_review",
    summary: "Brand, class/type, and alcohol statements should share one field of vision.",
    citations: ["27 CFR 5.63", "27 CFR 5.64", "27 CFR 5.65"],
  },
  {
    id: "DS-02",
    title: "Brand Name",
    scope: "brand_name",
    requirement: "required",
    summary: "Brand name must appear and match the application value.",
    citations: ["27 CFR 5.64"],
  },
  {
    id: "DS-03",
    title: "Class/Type Designation",
    scope: "class_type_designation",
    requirement: "required",
    summary: "Class/type or permitted alternative designation must be present.",
    citations: ["27 CFR 5.141", "27 CFR 5.165"],
  },
  {
    id: "DS-04",
    title: "Alcohol Content Statement",
    scope: "alcohol_content",
    requirement: "required",
    summary: "Alcohol content must be provided and normalized ABV/proof checks apply.",
    citations: ["27 CFR 5.65"],
  },
  {
    id: "DS-05",
    title: "Net Contents",
    scope: "net_contents",
    requirement: "required",
    summary: "Net contents are required with acceptable metric expression.",
    citations: ["27 CFR 5.70", "27 CFR 5.203"],
  },
  {
    id: "DS-06",
    title: "Name and Address",
    scope: "name_address",
    requirement: "conditional",
    summary: "Name/address statement is expected; imported workflows prioritize strict presence.",
    citations: ["27 CFR 5.66", "27 CFR 5.67", "27 CFR 5.68"],
  },
  {
    id: "DS-07",
    title: "Government Health Warning",
    scope: "government_warning",
    requirement: "required",
    summary: "Warning must match exact text with uppercase prefix and formatting checks.",
    citations: ["27 CFR part 16"],
  },
  {
    id: "DS-08",
    title: "Country of Origin",
    scope: "country_of_origin",
    requirement: "conditional",
    summary: "Country-of-origin statement is required when product is imported.",
    citations: ["19 CFR 134.11", "27 CFR 5.69"],
  },
];

const WINE_RULES: ExecutablePolicyRule[] = [
  {
    id: "W-01",
    title: "Brand Name",
    scope: "brand_name",
    requirement: "required",
    summary: "Brand name must appear and match application values.",
    citations: ["27 CFR 4.33"],
  },
  {
    id: "W-02",
    title: "Class/Type Designation",
    scope: "class_type_designation",
    requirement: "required",
    summary: "Class/type or truthful composition statement is required.",
    citations: ["27 CFR 4.21", "27 CFR 4.34", "27 CFR 4.91"],
  },
  {
    id: "W-05",
    title: "Alcohol Content",
    scope: "alcohol_content",
    requirement: "required",
    summary: "Alcohol content should be present and comparable under ABV normalization.",
    citations: ["27 CFR 4.36"],
  },
  {
    id: "W-06",
    title: "Net Contents",
    scope: "net_contents",
    requirement: "required",
    summary: "Net contents must be present with accepted expression and normalized units.",
    citations: ["27 CFR 4.37", "27 CFR 4.70(b)", "27 CFR 4.72"],
  },
  {
    id: "W-07",
    title: "Name and Address",
    scope: "name_address",
    requirement: "conditional",
    summary: "Name/address is typically expected; imported products enforce stricter requirement.",
    citations: ["27 CFR 4.35"],
  },
  {
    id: "W-09",
    title: "Government Health Warning",
    scope: "government_warning",
    requirement: "required",
    summary: "Government warning requires strict text and uppercase prefix checks.",
    citations: ["27 CFR part 16"],
  },
  {
    id: "W-10",
    title: "Country of Origin",
    scope: "country_of_origin",
    requirement: "conditional",
    summary: "Country-of-origin statement is mandatory for imported wine products.",
    citations: ["19 CFR 134.11"],
  },
];

const BEER_RULES: ExecutablePolicyRule[] = [
  {
    id: "MB-01",
    title: "Brand Name",
    scope: "brand_name",
    requirement: "required",
    summary: "Brand name must be present and match application values.",
    citations: ["27 CFR 7.64"],
  },
  {
    id: "MB-02",
    title: "Designation",
    scope: "class_type_designation",
    requirement: "required",
    summary: "Class/type or valid alternative designation must be present.",
    citations: ["27 CFR 7.63", "27 CFR part 7 subpart I"],
  },
  {
    id: "MB-04",
    title: "Net Contents",
    scope: "net_contents",
    requirement: "required",
    summary: "Net contents are required with acceptable U.S. customary notation.",
    citations: ["27 CFR 7.70"],
  },
  {
    id: "MB-05",
    title: "Alcohol Content",
    scope: "alcohol_content",
    requirement: "conditional",
    summary: "Alcohol statement is conditional and validated when supplied by application data.",
    citations: ["27 CFR 7.65"],
  },
  {
    id: "MB-03",
    title: "Name and Address (Domestic)",
    scope: "name_address",
    requirement: "conditional",
    summary: "Name/address expected with domestic rules; strict requirement for import path.",
    citations: ["27 CFR 7.66", "27 CFR 25.141", "27 CFR 25.142"],
  },
  {
    id: "MB-06",
    title: "Government Health Warning",
    scope: "government_warning",
    requirement: "required",
    summary: "Government warning must match required text and formatting expectations.",
    citations: ["27 CFR part 16"],
  },
  {
    id: "MB-07",
    title: "Country of Origin",
    scope: "country_of_origin",
    requirement: "conditional",
    summary: "Country-of-origin statement is mandatory for imported malt beverages.",
    citations: ["27 CFR 7.69", "19 CFR parts 102 and 134"],
  },
  {
    id: "MB-08",
    title: "Name and Address (Imported)",
    scope: "name_address",
    requirement: "conditional",
    summary: "Importer name/address follows imported labeling path requirements.",
    citations: ["27 CFR 7.67", "27 CFR 7.68"],
  },
];

const OTHER_RULES: ExecutablePolicyRule[] = [
  {
    id: "GEN-01",
    title: "Brand Name",
    scope: "brand_name",
    requirement: "required",
    summary: "Brand name is required for core verification workflows.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-02",
    title: "Class/Type",
    scope: "class_type_designation",
    requirement: "required",
    summary: "Class/type designation is required for core verification workflows.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-03",
    title: "Alcohol Content",
    scope: "alcohol_content",
    requirement: "conditional",
    summary: "Alcohol content is conditional and enforced when supplied.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-04",
    title: "Net Contents",
    scope: "net_contents",
    requirement: "required",
    summary: "Net contents are required for core verification workflows.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-05",
    title: "Name/Address",
    scope: "name_address",
    requirement: "conditional",
    summary: "Name/address verification is conditional unless imported.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-06",
    title: "Country of Origin",
    scope: "country_of_origin",
    requirement: "conditional",
    summary: "Country of origin is required for imported products.",
    citations: ["MVP core field policy"],
  },
  {
    id: "GEN-07",
    title: "Government Warning",
    scope: "government_warning",
    requirement: "required",
    summary: "Government warning must be validated under strict checks.",
    citations: ["MVP core field policy"],
  },
];

export const EXECUTABLE_POLICY_RULESETS: Record<AlcoholClass, ClassRuleset> = {
  distilled_spirits: {
    sourceRuleset: "docs/rulesets/distilled-spirits-ttb-label-rules.md",
    rules: DISTILLED_SPIRITS_RULES,
  },
  wine: {
    sourceRuleset: "docs/rulesets/wine-ttb-label-rules.md",
    rules: WINE_RULES,
  },
  beer: {
    sourceRuleset: "docs/rulesets/malt-beverage-ttb-label-rules.md",
    rules: BEER_RULES,
  },
  other: {
    sourceRuleset: "docs/LABEL_VERIFICATION_APP.md",
    rules: OTHER_RULES,
  },
};

export const getExecutableRulesForClass = (alcoholClass: AlcoholClass) => {
  return EXECUTABLE_POLICY_RULESETS[alcoholClass].rules;
};

export const getSupportingRuleIdsForField = (
  alcoholClass: AlcoholClass,
  field: FieldKey,
) => {
  return getExecutableRulesForClass(alcoholClass)
    .filter((rule) => rule.scope === field)
    .map((rule) => rule.id);
};
