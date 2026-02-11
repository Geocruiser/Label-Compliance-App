import type { UnitSystem } from "@/lib/class-rules";
import { collapseWhitespace } from "@/lib/normalization";

export type ParsedAlcoholContent = {
  abvPercent: number | null;
  proof: number | null;
};

export type NetUnit = "ml" | "l" | "fl_oz" | "oz" | "pt" | "qt" | "gal";

export type ParsedNetContents = {
  value: number;
  unit: NetUnit;
  volumeMl: number;
  unitSystem: UnitSystem;
};

const toNumber = (value: string) => {
  const parsedNumber = Number.parseFloat(value);
  if (Number.isNaN(parsedNumber)) {
    return null;
  }

  return parsedNumber;
};

const normalizeNumericInput = (value: string) => {
  return value.replace(",", ".").replace(/\s+/g, " ");
};

const ABV_REGEX =
  /(\d+(?:\.\d+)?)\s*%\s*(?:ABV|ALC\.?\s*\/?\s*VOL\.?|ALC\/VOL)?/i;
const PROOF_REGEX = /(\d+(?:\.\d+)?)\s*PROOF/i;

export const parseAlcoholContent = (
  input: string | null,
): ParsedAlcoholContent | null => {
  if (!input) {
    return null;
  }

  const normalizedInput = normalizeNumericInput(input);
  const normalizedUpper = normalizedInput.toUpperCase();
  if (!/(PROOF|ABV|ALC|VOL|%)/.test(normalizedUpper)) {
    return null;
  }

  const abvMatch = normalizedInput.match(ABV_REGEX);
  const proofMatch = normalizedInput.match(PROOF_REGEX);

  const parsedAbv = abvMatch?.[1] ? toNumber(abvMatch[1]) : null;
  const parsedProof = proofMatch?.[1] ? toNumber(proofMatch[1]) : null;

  const abvPercent =
    parsedAbv !== null
      ? Math.max(0, Math.min(100, parsedAbv))
      : parsedProof !== null
        ? Math.max(0, Math.min(100, parsedProof / 2))
        : null;
  const proof =
    parsedProof !== null
      ? Math.max(0, Math.min(200, parsedProof))
      : abvPercent !== null
        ? Math.max(0, Math.min(200, abvPercent * 2))
        : null;

  if (abvPercent === null && proof === null) {
    return null;
  }

  return {
    abvPercent,
    proof,
  };
};

const NET_CONTENTS_REGEX =
  /(\d+(?:\.\d+)?)\s*(ML|MILLILITERS?|L|LITERS?|FL\.?\s*OZ|FLUID\s*OUNCES?|OZ|OUNCES?|PT|PINTS?|QT|QUARTS?|GAL|GALLONS?)/i;

const normalizeNetUnit = (unit: string): NetUnit | null => {
  const token = unit.toLowerCase().replace(/\./g, "").replace(/\s+/g, "_");

  if (token === "ml" || token === "milliliter" || token === "milliliters") {
    return "ml";
  }

  if (token === "l" || token === "liter" || token === "liters") {
    return "l";
  }

  if (
    token === "fl_oz" ||
    token === "fluid_ounce" ||
    token === "fluid_ounces"
  ) {
    return "fl_oz";
  }

  if (token === "oz" || token === "ounce" || token === "ounces") {
    return "oz";
  }

  if (token === "pt" || token === "pint" || token === "pints") {
    return "pt";
  }

  if (token === "qt" || token === "quart" || token === "quarts") {
    return "qt";
  }

  if (token === "gal" || token === "gallon" || token === "gallons") {
    return "gal";
  }

  return null;
};

const volumeToMl = (value: number, unit: NetUnit) => {
  if (unit === "ml") {
    return value;
  }

  if (unit === "l") {
    return value * 1000;
  }

  if (unit === "fl_oz" || unit === "oz") {
    return value * 29.5735;
  }

  if (unit === "pt") {
    return value * 473.176;
  }

  if (unit === "qt") {
    return value * 946.353;
  }

  return value * 3785.41;
};

const toUnitSystem = (unit: NetUnit): UnitSystem => {
  if (unit === "ml" || unit === "l") {
    return "metric";
  }

  return "us_customary";
};

export const parseNetContents = (input: string | null): ParsedNetContents | null => {
  if (!input) {
    return null;
  }

  const normalizedInput = normalizeNumericInput(collapseWhitespace(input));
  const match = normalizedInput.match(NET_CONTENTS_REGEX);
  if (!match) {
    return null;
  }

  const parsedValue = toNumber(match[1]);
  const parsedUnit = normalizeNetUnit(match[2]);
  if (parsedValue === null || parsedUnit === null) {
    return null;
  }

  return {
    value: parsedValue,
    unit: parsedUnit,
    volumeMl: volumeToMl(parsedValue, parsedUnit),
    unitSystem: toUnitSystem(parsedUnit),
  };
};
