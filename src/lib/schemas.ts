import { z } from "zod";
import { GOVERNMENT_WARNING_TEXT } from "@/lib/constants";
import type { AlcoholClass, CanonicalApplication } from "@/lib/types";

const legacyTestFormSchema = z.object({
  cola_application_id: z.string().min(1),
  label_image_name: z.string().optional(),
  brand_name: z.string().nullable(),
  class_type_designation: z.string().nullable(),
  alcohol_content: z.string().nullable(),
  net_contents: z.string().nullable(),
  bottler_producer_name_address: z.string().nullable(),
  is_imported: z.boolean().default(false),
  country_of_origin_import: z.string().nullable(),
  government_health_warning_required: z.boolean().default(true),
});

const prdApplicationSchema = z.object({
  application_id: z.string().min(1),
  alcohol_class: z.enum(["wine", "beer", "distilled_spirits", "other"]),
  is_import: z.boolean().optional(),
  fields: z.object({
    brand_name: z.string().nullable(),
    class_type_designation: z.string().nullable(),
    alcohol_content: z.object({
      abv_percent: z.number().nullable(),
      proof: z.number().nullable(),
      display_text: z.string().nullable(),
    }),
    net_contents: z.object({
      value: z.number().nullable(),
      unit: z.string().nullable(),
      display_text: z.string().nullable(),
    }),
    producer: z.object({
      name_address: z.string().nullable(),
    }),
    country_of_origin: z.string().nullable(),
    government_warning_text: z.string().min(1),
  }),
});

const supportedInputSchema = z.union([legacyTestFormSchema, prdApplicationSchema]);

const inferAlcoholClass = (classTypeDesignation: string | null): AlcoholClass => {
  if (!classTypeDesignation) {
    return "other";
  }

  const normalizedDesignation = classTypeDesignation.toLowerCase();
  const beerKeywords = ["ipa", "lager", "ale", "stout", "porter", "pilsner"];
  const wineKeywords = ["wine", "rose", "ros", "champagne"];
  const distilledKeywords = [
    "rum",
    "vodka",
    "whiskey",
    "whisky",
    "bourbon",
    "gin",
    "tequila",
    "brandy",
    "spirit",
  ];

  if (beerKeywords.some((keyword) => normalizedDesignation.includes(keyword))) {
    return "beer";
  }

  if (wineKeywords.some((keyword) => normalizedDesignation.includes(keyword))) {
    return "wine";
  }

  if (
    distilledKeywords.some((keyword) =>
      normalizedDesignation.includes(keyword),
    )
  ) {
    return "distilled_spirits";
  }

  return "other";
};

const coerceAlcoholDisplayText = (
  alcohol: z.infer<typeof prdApplicationSchema>["fields"]["alcohol_content"],
) => {
  if (alcohol.display_text && alcohol.display_text.trim().length > 0) {
    return alcohol.display_text.trim();
  }

  if (alcohol.abv_percent !== null && alcohol.proof !== null) {
    return `${alcohol.abv_percent}% ABV (${alcohol.proof} PROOF)`;
  }

  if (alcohol.abv_percent !== null) {
    return `${alcohol.abv_percent}% ABV`;
  }

  if (alcohol.proof !== null) {
    return `${alcohol.proof} PROOF`;
  }

  return null;
};

const coerceNetContentsText = (
  netContents: z.infer<typeof prdApplicationSchema>["fields"]["net_contents"],
) => {
  if (netContents.display_text && netContents.display_text.trim().length > 0) {
    return netContents.display_text.trim();
  }

  if (netContents.value !== null && netContents.unit !== null) {
    return `${netContents.value} ${netContents.unit}`;
  }

  return null;
};

export const parseApplicationJson = (rawJson: unknown): CanonicalApplication => {
  const parsed = supportedInputSchema.parse(rawJson);

  if ("cola_application_id" in parsed) {
    return {
      applicationId: parsed.cola_application_id,
      alcoholClass: inferAlcoholClass(parsed.class_type_designation),
      isImport: parsed.is_imported,
      fields: {
        brandName: parsed.brand_name,
        classTypeDesignation: parsed.class_type_designation,
        alcoholContent: parsed.alcohol_content,
        netContents: parsed.net_contents,
        nameAddress: parsed.bottler_producer_name_address,
        countryOfOrigin: parsed.country_of_origin_import,
        governmentWarningRequired: parsed.government_health_warning_required,
        governmentWarningText: GOVERNMENT_WARNING_TEXT,
      },
      sourceSchema: "legacy_test_form",
    };
  }

  return {
    applicationId: parsed.application_id,
    alcoholClass: parsed.alcohol_class,
    isImport:
      parsed.is_import ?? Boolean(parsed.fields.country_of_origin?.trim().length),
    fields: {
      brandName: parsed.fields.brand_name,
      classTypeDesignation: parsed.fields.class_type_designation,
      alcoholContent: coerceAlcoholDisplayText(parsed.fields.alcohol_content),
      netContents: coerceNetContentsText(parsed.fields.net_contents),
      nameAddress: parsed.fields.producer.name_address,
      countryOfOrigin: parsed.fields.country_of_origin,
      governmentWarningRequired: true,
      governmentWarningText: parsed.fields.government_warning_text,
    },
    sourceSchema: "prd",
  };
};
