import {
  getFieldRequirementProfile as resolveFieldRequirementProfile,
  getRequirementMatrixForClass,
} from "@/lib/policy/requirement-matrix";

export type UnitSystem = "metric" | "us_customary" | "neutral";

type NetUnitPolicy = {
  expectedUnitSystem: UnitSystem;
  isPreferredUnit: boolean;
};

export { getRequirementMatrixForClass };

export const getFieldRequirementProfile = (
  application: Parameters<typeof resolveFieldRequirementProfile>[0],
  field: Parameters<typeof resolveFieldRequirementProfile>[1],
) => {
  return resolveFieldRequirementProfile(application, field);
};

export const getNetUnitSystemForClass = (
  alcoholClass: Parameters<typeof getRequirementMatrixForClass>[0],
): UnitSystem => {
  if (alcoholClass === "beer") {
    return "us_customary";
  }

  if (alcoholClass === "wine" || alcoholClass === "distilled_spirits") {
    return "metric";
  }

  return "neutral";
};

export const getNetUnitPolicy = (
  alcoholClass: Parameters<typeof getRequirementMatrixForClass>[0],
  actualUnitSystem: UnitSystem,
): NetUnitPolicy => {
  const expectedUnitSystem = getNetUnitSystemForClass(alcoholClass);

  if (expectedUnitSystem === "neutral") {
    return {
      expectedUnitSystem,
      isPreferredUnit: true,
    };
  }

  return {
    expectedUnitSystem,
    isPreferredUnit: expectedUnitSystem === actualUnitSystem,
  };
};
