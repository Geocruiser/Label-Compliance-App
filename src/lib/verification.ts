import { FIELD_LABELS, FIELD_ORDER } from "@/lib/constants";
import {
  getFieldRequirementProfile,
  getNetUnitPolicy,
} from "@/lib/class-rules";
import {
  collapseWhitespace,
  diceCoefficient,
  normalizeText,
  normalizedIncludes,
} from "@/lib/normalization";
import {
  parseAlcoholContent,
  parseNetContents,
} from "@/lib/value-parsers";
import type {
  BoundingBox,
  CanonicalApplication,
  FieldKey,
  OcrLine,
  VerificationFieldResult,
} from "@/lib/types";

type MatchCandidate = {
  line: OcrLine;
  score: number;
};

type FieldExpectation = {
  field: FieldKey;
  expectedValue: string | null;
  isRequired: boolean;
  requirementReason: string;
  supportingRuleIds: string[];
};

const formatApplicationValue = (value: string | null) => {
  if (!value) {
    return "N/A";
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : "N/A";
};

const appendRuleContext = (reason: string, ruleIds: string[]) => {
  if (ruleIds.length === 0) {
    return reason;
  }

  return `${reason} (Rules: ${ruleIds.join(", ")})`;
};

const mergeBoxes = (boxes: BoundingBox[]): BoundingBox | null => {
  if (boxes.length === 0) {
    return null;
  }

  return boxes.reduce<BoundingBox>(
    (mergedBox, currentBox) => ({
      x0: Math.min(mergedBox.x0, currentBox.x0),
      y0: Math.min(mergedBox.y0, currentBox.y0),
      x1: Math.max(mergedBox.x1, currentBox.x1),
      y1: Math.max(mergedBox.y1, currentBox.y1),
    }),
    boxes[0],
  );
};

const averageConfidence = (lines: OcrLine[]) => {
  if (lines.length === 0) {
    return null;
  }

  return (
    lines.reduce((accumulator, currentLine) => {
      return accumulator + currentLine.confidence;
    }, 0) / lines.length
  );
};

const calibratedConfidence = (ocrConfidence: number, matchScore: number) => {
  const weightedScore = (ocrConfidence * 0.6) + (matchScore * 0.4);
  return Math.max(ocrConfidence, Math.min(0.99, weightedScore));
};

const ADDRESS_LIKE_REGEX =
  /\b(distilled|bottled|imported|produced|manufactured|spirits|company|co\.?|inc\.?|llc|s\.p\.a\.?|ltd|street|st\.|avenue|ave\.|road|rd\.|city|state)\b/i;

const isAddressLikeText = (value: string) => {
  return ADDRESS_LIKE_REGEX.test(value) || /,\s*[A-Za-z]/.test(value) || /\d/.test(value);
};

const isMostlyUppercase = (value: string) => {
  const lettersOnly = value.replace(/[^A-Za-z]/g, "");
  if (lettersOnly.length === 0) {
    return false;
  }

  const uppercaseLetters = lettersOnly.replace(/[^A-Z]/g, "").length;
  return uppercaseLetters / lettersOnly.length >= 0.7;
};

const tokenizeNormalizedText = (value: string) => {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
};

const getApproximateTokenCoverage = (
  expectedTokens: string[],
  candidateText: string,
) => {
  if (expectedTokens.length === 0) {
    return 0;
  }

  const candidateTokens = tokenizeNormalizedText(candidateText);
  if (candidateTokens.length === 0) {
    return 0;
  }

  let coveredCount = 0;
  for (const expectedToken of expectedTokens) {
    let bestTokenSimilarity = 0;
    for (const candidateToken of candidateTokens) {
      const tokenSimilarity = diceCoefficient(expectedToken, candidateToken);
      if (tokenSimilarity > bestTokenSimilarity) {
        bestTokenSimilarity = tokenSimilarity;
      }
    }

    if (bestTokenSimilarity >= 0.58) {
      coveredCount += 1;
    }
  }

  return coveredCount / expectedTokens.length;
};

const formatAlcoholValue = (abvPercent: number | null, proof: number | null) => {
  if (abvPercent === null && proof === null) {
    return "N/A";
  }

  const chunks: string[] = [];
  if (abvPercent !== null) {
    chunks.push(`${abvPercent.toFixed(1)}% ABV`);
  }
  if (proof !== null) {
    chunks.push(`${proof.toFixed(1)} PROOF`);
  }

  return chunks.join(" | ");
};

const getCombinedOcrText = (ocrLines: OcrLine[]) => {
  return collapseWhitespace(ocrLines.map((line) => line.text).join(" "));
};

const getAggregateMatchCandidate = (
  field: FieldKey,
  expectedValue: string,
  ocrLines: OcrLine[],
): MatchCandidate | null => {
  const normalizedTokens = tokenizeNormalizedText(expectedValue);

  if (normalizedTokens.length === 0) {
    return null;
  }

  const maxY = ocrLines.reduce((largest, line) => Math.max(largest, line.bbox.y1), 1);
  const tokenLines = ocrLines.filter((line) => {
    const normalizedLine = normalizeText(line.text);
    const exactTokenMatch = normalizedTokens.some((token) =>
      normalizedLine.includes(token),
    );

    if (exactTokenMatch) {
      return true;
    }

    return getApproximateTokenCoverage(normalizedTokens, line.text) >= 0.5;
  });

  let filteredTokenLines = tokenLines;
  if (field === "brand_name") {
    filteredTokenLines = tokenLines.filter((line) => {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const isUpperRegion = lineCenterY <= maxY * 0.65;
      return isUpperRegion && !isAddressLikeText(line.text);
    });
  }

  if (filteredTokenLines.length === 0) {
    return null;
  }

  const aggregateText = collapseWhitespace(
    filteredTokenLines.map((line) => line.text).join(" "),
  );
  const aggregateConfidence = averageConfidence(filteredTokenLines) ?? 0;
  const includesExpected = normalizedIncludes(aggregateText, expectedValue);
  const similarity = diceCoefficient(expectedValue, aggregateText);
  const tokenCoverage = getApproximateTokenCoverage(
    normalizedTokens,
    aggregateText,
  );

  const aggregateScore =
    (Math.max(similarity, includesExpected ? 0.97 : 0, tokenCoverage) * 0.75) +
    (aggregateConfidence * 0.25);

  if (aggregateScore < 0.5) {
    return null;
  }

  const mergedEvidenceBox = mergeBoxes(filteredTokenLines.map((line) => line.bbox));
  if (!mergedEvidenceBox) {
    return null;
  }

  return {
    line: {
      text: aggregateText,
      confidence: aggregateConfidence,
      bbox: mergedEvidenceBox,
    },
    score: aggregateScore,
  };
};

const getBestLineMatch = (
  field: FieldKey,
  expectedValue: string,
  ocrLines: OcrLine[],
): MatchCandidate | null => {
  let bestCandidate: MatchCandidate | null = null;
  const normalizedTokens = tokenizeNormalizedText(expectedValue);
  const maxY = ocrLines.reduce((largest, line) => Math.max(largest, line.bbox.y1), 1);

  for (const line of ocrLines) {
    const similarity = diceCoefficient(expectedValue, line.text);
    const includesMatch = normalizedIncludes(line.text, expectedValue);
    const expectedContainsLine = normalizedIncludes(expectedValue, line.text);

    const lineScoreBase = Math.max(
      similarity,
      includesMatch ? 0.99 : 0,
      expectedContainsLine ? 0.8 : 0,
    );

    let lineScore = (lineScoreBase * 0.8) + (line.confidence * 0.2);
    const tokenCoverage = getApproximateTokenCoverage(normalizedTokens, line.text);

    if (field === "brand_name") {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const topBias = 1 - (lineCenterY / maxY);
      const uppercaseBonus = isMostlyUppercase(line.text) ? 0.05 : 0;
      const longLinePenalty = line.text.trim().split(/\s+/).length > 6 ? 0.12 : 0;
      const addressPenalty = isAddressLikeText(line.text) ? 0.38 : 0;
      lineScore =
        (lineScore * 0.7) +
        (tokenCoverage * 0.3) +
        (Math.max(0, topBias) * 0.08) +
        uppercaseBonus -
        longLinePenalty -
        addressPenalty;
    }

    if (field === "name_address") {
      if (isAddressLikeText(line.text)) {
        lineScore += 0.22;
      }
      if (/,/.test(line.text) || /\d/.test(line.text)) {
        lineScore += 0.08;
      }
    }

    if (!bestCandidate || lineScore > bestCandidate.score) {
      bestCandidate = {
        line,
        score: lineScore,
      };
    }
  }

  const aggregateCandidate = getAggregateMatchCandidate(field, expectedValue, ocrLines);
  if (aggregateCandidate) {
    if (!bestCandidate || aggregateCandidate.score > bestCandidate.score) {
      bestCandidate = aggregateCandidate;
    }
  }

  const minimumScore = field === "brand_name" ? 0.28 : 0.4;
  if (!bestCandidate || bestCandidate.score < minimumScore) {
    return null;
  }

  return bestCandidate;
};

const getFieldExpectations = (
  application: CanonicalApplication,
): FieldExpectation[] => {
  const fieldKeys: FieldKey[] = [
    "brand_name",
    "class_type_designation",
    "alcohol_content",
    "net_contents",
    "name_address",
    "country_of_origin",
  ];

  return fieldKeys.map((field): FieldExpectation => {
    const requirementProfile = getFieldRequirementProfile(application, field);

    let expectedValue: string | null = null;
    if (field === "brand_name") {
      expectedValue = application.fields.brandName;
    } else if (field === "class_type_designation") {
      expectedValue = application.fields.classTypeDesignation;
    } else if (field === "alcohol_content") {
      expectedValue = application.fields.alcoholContent;
    } else if (field === "net_contents") {
      expectedValue = application.fields.netContents;
    } else if (field === "name_address") {
      expectedValue = application.fields.nameAddress;
    } else if (field === "country_of_origin") {
      expectedValue = application.fields.countryOfOrigin;
    }

    return {
      field,
      expectedValue,
      isRequired: requirementProfile.isRequired,
      requirementReason: requirementProfile.rationale,
      supportingRuleIds: requirementProfile.supportingRuleIds,
    };
  });
};

const verifyGovernmentWarning = (
  application: CanonicalApplication,
  ocrLines: OcrLine[],
): VerificationFieldResult => {
  const expectedValue = application.fields.governmentWarningText;
  const warningStartIndex = ocrLines.findIndex((line) =>
    normalizedIncludes(line.text, "government warning"),
  );

  if (!application.fields.governmentWarningRequired) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: "N/A (not required for this application)",
      extractedValue: "N/A",
      status: "Pass",
      confidence: null,
      reason: "Government warning is not required by the application payload.",
      evidenceBox: null,
    };
  }

  if (warningStartIndex < 0) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: "Not detected in OCR output",
      status: "Missing",
      confidence: null,
      reason:
        "Expected warning statement was not detected in OCR output on this label.",
      evidenceBox: null,
    };
  }

  const warningSlice = ocrLines.slice(warningStartIndex, warningStartIndex + 10);
  const extractedWarning = warningSlice.map((line) => line.text).join(" ");
  const collapsedExtractedWarning = collapseWhitespace(extractedWarning);
  const collapsedExpectedWarning = collapseWhitespace(expectedValue);
  const extractedPrefix = collapsedExtractedWarning.slice(
    0,
    "GOVERNMENT WARNING:".length + 2,
  );
  const uppercasePrefixPresent = extractedPrefix.startsWith("GOVERNMENT WARNING:");
  const hasClauseMarkers =
    collapsedExtractedWarning.includes("(1)") &&
    collapsedExtractedWarning.includes("(2)");
  const mentionsSurgeonGeneral = normalizedIncludes(
    collapsedExtractedWarning,
    "surgeon general",
  );
  const isExactText = collapsedExtractedWarning.includes(collapsedExpectedWarning);
  const warningSimilarity = diceCoefficient(expectedValue, extractedWarning);
  const warningConfidence = averageConfidence(warningSlice);

  if (isExactText && uppercasePrefixPresent) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: collapsedExtractedWarning,
      status: "Pass",
      confidence: warningConfidence,
      reason:
        "Government warning matched exact expected phrase and uppercase prefix requirement.",
      evidenceBox: mergeBoxes(warningSlice.map((line) => line.bbox)),
    };
  }

  if (
    warningSimilarity >= 0.9 &&
    hasClauseMarkers &&
    mentionsSurgeonGeneral &&
    uppercasePrefixPresent &&
    warningConfidence !== null &&
    warningConfidence >= 0.78
  ) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: collapsedExtractedWarning,
      status: "Fail",
      confidence: warningConfidence,
      reason:
        "Warning was confidently detected but does not exactly match required wording.",
      evidenceBox: mergeBoxes(warningSlice.map((line) => line.bbox)),
    };
  }

  if (warningSimilarity >= 0.72 || hasClauseMarkers) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: collapsedExtractedWarning,
      status: "Needs Review",
      confidence: warningConfidence,
      reason:
        "Warning region was detected, but strict wording or format checks were inconclusive.",
      evidenceBox: mergeBoxes(warningSlice.map((line) => line.bbox)),
    };
  }

  return {
    field: "government_warning",
    label: FIELD_LABELS.government_warning,
    applicationValue: formatApplicationValue(expectedValue),
    extractedValue: collapsedExtractedWarning,
    status: "Missing",
    confidence: warningConfidence,
    reason:
      "Detected text near warning region was too incomplete for strict validation.",
    evidenceBox: mergeBoxes(warningSlice.map((line) => line.bbox)),
  };
};

const verifyTextField = (
  expectation: FieldExpectation,
  ocrLines: OcrLine[],
): VerificationFieldResult => {
  const expectedValue = expectation.expectedValue;

  if (!expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "N/A (not required for this application)",
      extractedValue: "N/A",
      status: "Pass",
      confidence: null,
      reason: appendRuleContext(
        expectation.requirementReason,
        expectation.supportingRuleIds,
      ),
      evidenceBox: null,
    };
  }

  if (expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "Missing from application JSON",
      extractedValue: "N/A",
      status: "Needs Review",
      confidence: null,
      reason: appendRuleContext(
        `Required field is missing in application JSON. ${expectation.requirementReason}`,
        expectation.supportingRuleIds,
      ),
      evidenceBox: null,
    };
  }

  if (!expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "N/A",
      extractedValue: "N/A",
      status: "Needs Review",
      confidence: null,
      reason: "Field expectation is not available for automated verification.",
      evidenceBox: null,
    };
  }

  const matchCandidate = getBestLineMatch(expectation.field, expectedValue, ocrLines);
  if (!matchCandidate) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: "Not detected in OCR output",
      status: "Missing",
      confidence: null,
      reason:
        "No OCR line matched the expected value with enough confidence.",
      evidenceBox: null,
    };
  }

  const resolvedConfidence = calibratedConfidence(
    matchCandidate.line.confidence,
    matchCandidate.score,
  );

  if (matchCandidate.score >= 0.9 && matchCandidate.line.confidence >= 0.55) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: matchCandidate.line.text,
      status: "Pass",
      confidence: resolvedConfidence,
      reason:
        "Detected line strongly matches the application value at a high confidence threshold.",
      evidenceBox: matchCandidate.line.bbox,
    };
  }

  if (matchCandidate.score >= 0.75) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: matchCandidate.line.text,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason:
        "Detected text is close to expected but below strict pass threshold.",
      evidenceBox: matchCandidate.line.bbox,
    };
  }

  return {
    field: expectation.field,
    label: FIELD_LABELS[expectation.field],
    applicationValue: formatApplicationValue(expectedValue),
    extractedValue: matchCandidate.line.text,
    status: "Fail",
    confidence: resolvedConfidence,
    reason:
      "Detected text does not match the application value under conservative matching rules.",
    evidenceBox: matchCandidate.line.bbox,
  };
};

const verifyAlcoholField = (
  expectation: FieldExpectation,
  application: CanonicalApplication,
  ocrLines: OcrLine[],
): VerificationFieldResult => {
  const expectedValue = expectation.expectedValue;
  const fullOcrText = getCombinedOcrText(ocrLines);

  if (!expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "N/A (not required for this application)",
      extractedValue: "N/A",
      status: "Pass",
      confidence: null,
      reason: appendRuleContext(
        expectation.requirementReason,
        expectation.supportingRuleIds,
      ),
      evidenceBox: null,
    };
  }

  if (expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "Missing from application JSON",
      extractedValue: "N/A",
      status: "Needs Review",
      confidence: null,
      reason: appendRuleContext(
        `Missing required alcohol value. ${expectation.requirementReason}`,
        expectation.supportingRuleIds,
      ),
      evidenceBox: null,
    };
  }

  if (!expectedValue) {
    return verifyTextField(expectation, ocrLines);
  }

  const expectedAlcohol = parseAlcoholContent(expectedValue);
  if (!expectedAlcohol) {
    return verifyTextField(expectation, ocrLines);
  }

  let bestCandidate: MatchCandidate | null = null;
  let bestParsedAlcohol: ReturnType<typeof parseAlcoholContent> | null = null;

  for (const line of ocrLines) {
    const parsedAlcohol = parseAlcoholContent(line.text);
    if (!parsedAlcohol) {
      continue;
    }

    let abvScore = 1;
    if (expectedAlcohol.abvPercent !== null) {
      if (parsedAlcohol.abvPercent === null) {
        abvScore = 0;
      } else {
        const abvDiff = Math.abs(expectedAlcohol.abvPercent - parsedAlcohol.abvPercent);
        abvScore = Math.max(0, 1 - (abvDiff / 3));
      }
    }

    let proofScore = 1;
    if (expectedAlcohol.proof !== null) {
      if (parsedAlcohol.proof === null) {
        proofScore = 0;
      } else {
        const proofDiff = Math.abs(expectedAlcohol.proof - parsedAlcohol.proof);
        proofScore = Math.max(0, 1 - (proofDiff / 6));
      }
    }

    const normalizedScore = ((abvScore + proofScore) / 2) * 0.8 + (line.confidence * 0.2);

    if (!bestCandidate || normalizedScore > bestCandidate.score) {
      bestCandidate = {
        line,
        score: normalizedScore,
      };
      bestParsedAlcohol = parsedAlcohol;
    }
  }

  if (!bestCandidate || !bestParsedAlcohol) {
    const fullTextAlcohol = parseAlcoholContent(fullOcrText);
    if (fullTextAlcohol) {
      return {
        field: expectation.field,
        label: FIELD_LABELS[expectation.field],
        applicationValue: formatApplicationValue(expectedValue),
        extractedValue: `Detected across multiple OCR lines (${formatAlcoholValue(
          fullTextAlcohol.abvPercent,
          fullTextAlcohol.proof,
        )})`,
        status: "Needs Review",
        confidence: averageConfidence(ocrLines),
        reason:
          "Alcohol content appears across multiple OCR lines and needs manual confirmation.",
        evidenceBox: null,
      };
    }

    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: "Not detected in OCR output",
      status: expectation.isRequired ? "Missing" : "Pass",
      confidence: null,
      reason: expectation.isRequired
        ? "Alcohol content was not detected on label OCR output."
        : appendRuleContext(
            expectation.requirementReason,
            expectation.supportingRuleIds,
          ),
      evidenceBox: null,
    };
  }

  const abvDiff =
    expectedAlcohol.abvPercent !== null && bestParsedAlcohol.abvPercent !== null
      ? Math.abs(expectedAlcohol.abvPercent - bestParsedAlcohol.abvPercent)
      : null;
  const proofDiff =
    expectedAlcohol.proof !== null && bestParsedAlcohol.proof !== null
      ? Math.abs(expectedAlcohol.proof - bestParsedAlcohol.proof)
      : null;

  const abvStrongMatch = abvDiff !== null ? abvDiff <= 0.3 : true;
  const proofStrongMatch = proofDiff !== null ? proofDiff <= 1 : true;
  const abvNearMatch = abvDiff !== null ? abvDiff <= 1 : true;
  const proofNearMatch = proofDiff !== null ? proofDiff <= 3 : true;

  const normalizedExtracted = `${bestCandidate.line.text} (${formatAlcoholValue(
    bestParsedAlcohol.abvPercent,
    bestParsedAlcohol.proof,
  )})`;
  const resolvedConfidence = calibratedConfidence(
    bestCandidate.line.confidence,
    bestCandidate.score,
  );

  if (
    abvStrongMatch &&
    proofStrongMatch &&
    bestCandidate.line.confidence >= 0.55
  ) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Pass",
      confidence: resolvedConfidence,
      reason: `${application.alcoholClass} alcohol-content comparison passed normalized ABV/proof checks.`,
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  if (abvNearMatch && proofNearMatch) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason:
        "Alcohol values were close but below strict pass tolerances after normalization.",
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  if (bestCandidate.line.confidence >= 0.65) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Fail",
      confidence: resolvedConfidence,
      reason: "Alcohol value mismatch was detected with high OCR confidence.",
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  return {
    field: expectation.field,
    label: FIELD_LABELS[expectation.field],
    applicationValue: formatApplicationValue(expectedValue),
    extractedValue: normalizedExtracted,
    status: "Needs Review",
    confidence: resolvedConfidence,
    reason: "Alcohol value mismatch is ambiguous at current OCR confidence.",
    evidenceBox: bestCandidate.line.bbox,
  };
};

const verifyNetContentsField = (
  expectation: FieldExpectation,
  application: CanonicalApplication,
  ocrLines: OcrLine[],
): VerificationFieldResult => {
  const expectedValue = expectation.expectedValue;

  if (!expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "N/A (not required for this application)",
      extractedValue: "N/A",
      status: "Pass",
      confidence: null,
      reason: appendRuleContext(
        expectation.requirementReason,
        expectation.supportingRuleIds,
      ),
      evidenceBox: null,
    };
  }

  if (expectation.isRequired && !expectedValue) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: "Missing from application JSON",
      extractedValue: "N/A",
      status: "Needs Review",
      confidence: null,
      reason: "Required net contents value is missing in application JSON.",
      evidenceBox: null,
    };
  }

  if (!expectedValue) {
    return verifyTextField(expectation, ocrLines);
  }

  const expectedNetContents = parseNetContents(expectedValue);
  if (!expectedNetContents) {
    return verifyTextField(expectation, ocrLines);
  }

  let bestCandidate: MatchCandidate | null = null;
  let bestParsedNetContents: ReturnType<typeof parseNetContents> | null = null;
  let bestDifferenceMl = Number.POSITIVE_INFINITY;

  for (const line of ocrLines) {
    const parsedNetContents = parseNetContents(line.text);
    if (!parsedNetContents) {
      continue;
    }

    const differenceMl = Math.abs(
      expectedNetContents.volumeMl - parsedNetContents.volumeMl,
    );

    let comparisonScore = Math.max(0, 1 - (differenceMl / 120));
    if (parsedNetContents.unit === expectedNetContents.unit) {
      comparisonScore = Math.min(1, comparisonScore + 0.12);
    }

    const lineScore = (comparisonScore * 0.8) + (line.confidence * 0.2);
    if (!bestCandidate || lineScore > bestCandidate.score) {
      bestCandidate = {
        line,
        score: lineScore,
      };
      bestParsedNetContents = parsedNetContents;
      bestDifferenceMl = differenceMl;
    }
  }

  if (!bestCandidate || !bestParsedNetContents) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: "Not detected in OCR output",
      status: expectation.isRequired ? "Missing" : "Pass",
      confidence: null,
      reason: expectation.isRequired
        ? "Net contents statement was not detected on the label."
        : expectation.requirementReason,
      evidenceBox: null,
    };
  }

  const unitPolicy = getNetUnitPolicy(
    application.alcoholClass,
    bestParsedNetContents.unitSystem,
  );
  const normalizedExtracted = `${bestCandidate.line.text} (${bestParsedNetContents.volumeMl.toFixed(
    1,
  )} mL normalized)`;
  const resolvedConfidence = calibratedConfidence(
    bestCandidate.line.confidence,
    bestCandidate.score,
  );

  if (bestDifferenceMl <= 3 && bestCandidate.line.confidence >= 0.55) {
    if (unitPolicy.isPreferredUnit) {
      return {
        field: expectation.field,
        label: FIELD_LABELS[expectation.field],
        applicationValue: formatApplicationValue(expectedValue),
        extractedValue: normalizedExtracted,
        status: "Pass",
        confidence: resolvedConfidence,
        reason: "Net contents matched expected value after unit normalization.",
        evidenceBox: bestCandidate.line.bbox,
      };
    }

    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason: `Value matched but unit system differs from expected ${unitPolicy.expectedUnitSystem} convention for class.`,
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  if (bestDifferenceMl <= 15) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason:
        "Net contents were close after normalization but not within strict pass tolerance.",
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  if (bestCandidate.line.confidence < 0.6) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: normalizedExtracted,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason: "Net contents mismatch is uncertain because OCR confidence is low.",
      evidenceBox: bestCandidate.line.bbox,
    };
  }

  return {
    field: expectation.field,
    label: FIELD_LABELS[expectation.field],
    applicationValue: formatApplicationValue(expectedValue),
    extractedValue: normalizedExtracted,
    status: "Fail",
    confidence: resolvedConfidence,
    reason: "Net contents differ from application value after unit normalization.",
    evidenceBox: bestCandidate.line.bbox,
  };
};

export const verifyLabelLines = (
  application: CanonicalApplication,
  ocrLines: OcrLine[],
): VerificationFieldResult[] => {
  const regularFieldResults = getFieldExpectations(application).map((expectation) => {
    if (expectation.field === "alcohol_content") {
      return verifyAlcoholField(expectation, application, ocrLines);
    }

    if (expectation.field === "net_contents") {
      return verifyNetContentsField(expectation, application, ocrLines);
    }

    return verifyTextField(expectation, ocrLines);
  });
  const warningFieldResult = verifyGovernmentWarning(application, ocrLines);

  const allResults = [...regularFieldResults, warningFieldResult];
  const orderedResults = FIELD_ORDER.map((fieldKey) => {
    const matchingResult = allResults.find((result) => result.field === fieldKey);
    if (!matchingResult) {
      throw new Error(`Missing verification result for field: ${fieldKey}`);
    }

    return matchingResult;
  });

  return orderedResults;
};
