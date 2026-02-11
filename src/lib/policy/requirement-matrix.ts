import type { CanonicalApplication, FieldKey } from "@/lib/types";
import { getSupportingRuleIdsForField } from "@/lib/policy/rulesets";
import type { FieldRequirementLevel } from "@/lib/policy/rulesets";

type Matrix = Record<
  CanonicalApplication["alcoholClass"],
  Record<FieldKey, FieldRequirementLevel>
>;

const BASE_REQUIREMENT_MATRIX: Matrix = {
  distilled_spirits: {
    brand_name: "required",
    class_type_designation: "required",
    alcohol_content: "required",
    net_contents: "required",
    name_address: "conditional",
    country_of_origin: "conditional",
    government_warning: "required",
  },
  wine: {
    brand_name: "required",
    class_type_designation: "required",
    alcohol_content: "required",
    net_contents: "required",
    name_address: "conditional",
    country_of_origin: "conditional",
    government_warning: "required",
  },
  beer: {
    brand_name: "required",
    class_type_designation: "required",
    alcohol_content: "conditional",
    net_contents: "required",
    name_address: "conditional",
    country_of_origin: "conditional",
    government_warning: "required",
  },
  other: {
    brand_name: "required",
    class_type_designation: "required",
    alcohol_content: "conditional",
    net_contents: "required",
    name_address: "conditional",
    country_of_origin: "conditional",
    government_warning: "required",
  },
};

const buildReason = (field: FieldKey, level: FieldRequirementLevel) => {
  if (field === "country_of_origin") {
    return "Country of origin is mandatory when imported and optional otherwise.";
  }

  if (field === "name_address") {
    return "Name/address is required for imported paths and validated when supplied.";
  }

  if (field === "alcohol_content" && level === "conditional") {
    return "Alcohol content is conditional for this class and required when supplied.";
  }

  if (level === "required") {
    return "This field is required for the selected alcohol class.";
  }

  if (level === "optional") {
    return "This field is optional for the selected alcohol class.";
  }

  return "This field is conditionally required for the selected alcohol class.";
};

const getApplicationFieldValue = (
  application: CanonicalApplication,
  field: FieldKey,
) => {
  if (field === "brand_name") {
    return application.fields.brandName;
  }

  if (field === "class_type_designation") {
    return application.fields.classTypeDesignation;
  }

  if (field === "alcohol_content") {
    return application.fields.alcoholContent;
  }

  if (field === "net_contents") {
    return application.fields.netContents;
  }

  if (field === "name_address") {
    return application.fields.nameAddress;
  }

  if (field === "country_of_origin") {
    return application.fields.countryOfOrigin;
  }

  return application.fields.governmentWarningRequired
    ? application.fields.governmentWarningText
    : null;
};

export type FieldRequirementProfile = {
  level: FieldRequirementLevel;
  isRequired: boolean;
  rationale: string;
  supportingRuleIds: string[];
};

export const getRequirementMatrixForClass = (
  alcoholClass: CanonicalApplication["alcoholClass"],
) => {
  return BASE_REQUIREMENT_MATRIX[alcoholClass];
};

export const getFieldRequirementProfile = (
  application: CanonicalApplication,
  field: FieldKey,
): FieldRequirementProfile => {
  const baseLevel = getRequirementMatrixForClass(application.alcoholClass)[field];
  const fieldValue = getApplicationFieldValue(application, field);

  if (field === "country_of_origin") {
    return {
      level: baseLevel,
      isRequired: application.isImport,
      rationale: buildReason(field, baseLevel),
      supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
    };
  }

  if (field === "name_address") {
    return {
      level: baseLevel,
      isRequired: application.isImport || Boolean(fieldValue),
      rationale: buildReason(field, baseLevel),
      supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
    };
  }

  if (field === "government_warning") {
    return {
      level: baseLevel,
      isRequired: application.fields.governmentWarningRequired,
      rationale: buildReason(field, baseLevel),
      supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
    };
  }

  if (baseLevel === "required") {
    return {
      level: baseLevel,
      isRequired: true,
      rationale: buildReason(field, baseLevel),
      supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
    };
  }

  if (baseLevel === "optional") {
    return {
      level: baseLevel,
      isRequired: false,
      rationale: buildReason(field, baseLevel),
      supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
    };
  }

  return {
    level: baseLevel,
    isRequired: Boolean(fieldValue),
    rationale: buildReason(field, baseLevel),
    supportingRuleIds: getSupportingRuleIdsForField(application.alcoholClass, field),
  };
};
