import { describe, expect, it } from "vitest";
import {
  EXECUTABLE_POLICY_RULESETS,
  getExecutableRulesForClass,
} from "@/lib/policy/rulesets";
import { getFieldRequirementProfile, getRequirementMatrixForClass } from "@/lib/policy/requirement-matrix";
import { parseApplicationJson } from "@/lib/schemas";

describe("policy modules", () => {
  it("exposes executable rulesets for every alcohol class", () => {
    const classKeys = Object.keys(EXECUTABLE_POLICY_RULESETS);
    expect(classKeys).toEqual(["distilled_spirits", "wine", "beer", "other"]);

    classKeys.forEach((classKey) => {
      const rules = getExecutableRulesForClass(classKey as keyof typeof EXECUTABLE_POLICY_RULESETS);
      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.id.length).toBeGreaterThan(0);
        expect(rule.title.length).toBeGreaterThan(0);
      });
    });
  });

  it("returns matrix entries for all core fields", () => {
    const matrix = getRequirementMatrixForClass("distilled_spirits");
    expect(matrix.brand_name).toBe("required");
    expect(matrix.class_type_designation).toBe("required");
    expect(matrix.alcohol_content).toBe("required");
    expect(matrix.net_contents).toBe("required");
    expect(matrix.name_address).toBe("conditional");
    expect(matrix.country_of_origin).toBe("conditional");
    expect(matrix.government_warning).toBe("required");
  });

  it("applies import override for country and name/address requirements", () => {
    const app = parseApplicationJson({
      cola_application_id: "POLICY-TST-01",
      brand_name: "TEST",
      class_type_designation: "RUM",
      alcohol_content: "40% ABV",
      net_contents: "750 ML",
      bottler_producer_name_address: null,
      is_imported: true,
      country_of_origin_import: "BARBADOS",
      government_health_warning_required: true,
    });

    const countryProfile = getFieldRequirementProfile(app, "country_of_origin");
    const nameAddressProfile = getFieldRequirementProfile(app, "name_address");

    expect(countryProfile.isRequired).toBe(true);
    expect(nameAddressProfile.isRequired).toBe(true);
    expect(countryProfile.supportingRuleIds.length).toBeGreaterThan(0);
    expect(nameAddressProfile.supportingRuleIds.length).toBeGreaterThan(0);
  });
});
