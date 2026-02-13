import { FIELD_LABELS, FIELD_ORDER } from "@/lib/constants";
import {
  getFieldRequirementProfile,
  getNetUnitPolicy,
} from "@/lib/class-rules";
import {
  buildContiguousTokenClusters,
  clampEvidenceBoxByField,
  computeEvidenceBoxAreaRatio,
  isEvidenceBoxOversized,
  mergeEvidenceBoxes,
  removeOutlierTokens,
  sortTokensForReadingOrder,
} from "@/lib/evidence-box";
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
  OcrToken,
  VerificationFieldResult,
} from "@/lib/types";

type MatchCandidate = {
  line: OcrLine;
  score: number;
  source: "word" | "line";
  tokenCount: number;
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

const WARNING_PREFIX = "GOVERNMENT WARNING:";

const stripWarningPrefix = (value: string) => {
  return value.replace(/^government\s+warning:\s*/i, "").trim();
};

const getLineCenterY = (line: OcrLine) => {
  return (line.bbox.y0 + line.bbox.y1) / 2;
};

const getLineCenterX = (line: OcrLine) => {
  return (line.bbox.x0 + line.bbox.x1) / 2;
};

const getMedianLineHeight = (lines: OcrLine[]) => {
  if (lines.length === 0) {
    return 16;
  }

  const sortedHeights = lines
    .map((line) => Math.max(1, line.bbox.y1 - line.bbox.y0))
    .sort((left, right) => left - right);
  return sortedHeights[Math.floor(sortedHeights.length / 2)];
};

const sortLinesForWarningReadingOrder = (lines: OcrLine[]) => {
  if (lines.length <= 1) {
    return lines;
  }

  const sortedByY = [...lines].sort((left, right) => {
    return getLineCenterY(left) - getLineCenterY(right);
  });
  const medianHeight = getMedianLineHeight(sortedByY);
  const sameRowThreshold = Math.max(6, medianHeight * 0.5);

  const rowGroups: OcrLine[][] = [];
  const rowCenterYs: number[] = [];

  for (const line of sortedByY) {
    const centerY = getLineCenterY(line);
    if (rowGroups.length === 0) {
      rowGroups.push([line]);
      rowCenterYs.push(centerY);
      continue;
    }

    const rowIndex = rowGroups.length - 1;
    const rowCenterY = rowCenterYs[rowIndex];
    if (Math.abs(centerY - rowCenterY) <= sameRowThreshold) {
      rowGroups[rowIndex].push(line);
      const rowSize = rowGroups[rowIndex].length;
      rowCenterYs[rowIndex] = ((rowCenterY * (rowSize - 1)) + centerY) / rowSize;
      continue;
    }

    rowGroups.push([line]);
    rowCenterYs.push(centerY);
  }

  const orderedLines: OcrLine[] = [];
  for (const row of rowGroups) {
    orderedLines.push(
      ...row.sort((left, right) => getLineCenterX(left) - getLineCenterX(right)),
    );
  }

  return orderedLines;
};

const normalizeWarningBodyForComparison = (value: string) => {
  let corrected = value;
  // Common OCR punctuation artifacts.
  corrected = corrected.replace(/\s*\/\s*/g, " ");
  corrected = corrected.replace(/\(\s*\(/g, "(");
  // Common OCR token merge/split errors observed in warning text.
  corrected = corrected.replace(/\bofthe\b/gi, "of the");
  corrected = corrected.replace(/\bthe[\.\s]*risk\b/gi, "the risk");
  corrected = corrected.replace(/\babiity\b/gi, "ability");
  corrected = corrected.replace(/\bprobiems\b/gi, "problems");
  corrected = corrected.replace(/\bprob1ems\b/gi, "problems");
  corrected = corrected.replace(/\bofbirth\b/gi, "of birth");
  corrected = corrected.replace(
    /\bcnsptionalcoholicbeverages\b/gi,
    "consumption of alcoholic beverages",
  );
  corrected = corrected.replace(
    /\bconsumptionalcoholicbeverages\b/gi,
    "consumption of alcoholic beverages",
  );
  corrected = corrected.replace(
    /consumption of alcoholic beverages,\s*and may cause health problems\.?\s*impairs your (?:abiity|ability) to drive a car or operate machinery,?/gi,
    "consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems",
  );
  // Common OCR substitutions for clause markers and short words.
  corrected = corrected.replace(/\(\s*[il]\s*\)/gi, "(1)");
  corrected = corrected.replace(/\(\s*z\s*\)/gi, "(2)");
  corrected = corrected.replace(/\(\s*([12])\s*\)\s*/g, "($1) ");
  corrected = corrected.replace(/\b([12])([a-z])/gi, "$1 $2");
  corrected = corrected.replace(/\b1o\b/gi, "to");

  return normalizeText(corrected);
};

const isExpectedTokenSequencePresent = (expected: string, extracted: string) => {
  const expectedTokens = expected
    .split(" ")
    .filter((token) => token.length > 0)
    .filter((token) => token !== "1" && token !== "2");
  const extractedTokens = extracted.split(" ").filter((token) => token.length > 0);
  if (expectedTokens.length === 0) {
    return false;
  }

  const matchedIndices = new Set<number>();
  let extractedIndex = 0;
  for (const expectedToken of expectedTokens) {
    let tokenMatched = false;
    while (extractedIndex < extractedTokens.length) {
      const candidateToken = extractedTokens[extractedIndex];
      const candidateIndex = extractedIndex;
      extractedIndex += 1;
      if (candidateToken === expectedToken) {
        matchedIndices.add(candidateIndex);
        tokenMatched = true;
        break;
      }
    }

    if (!tokenMatched) {
      return false;
    }
  }

  for (let index = 0; index < extractedTokens.length; index += 1) {
    if (matchedIndices.has(index)) {
      continue;
    }

    const token = extractedTokens[index];
    const isTinyNoiseToken = token.length <= 2;
    if (!isTinyNoiseToken) {
      return false;
    }
  }

  return true;
};

const appendRuleContext = (reason: string, ruleIds: string[]) => {
  if (ruleIds.length === 0) {
    return reason;
  }

  return `${reason} (Rules: ${ruleIds.join(", ")})`;
};

const mergeBoxes = (boxes: BoundingBox[]) => mergeEvidenceBoxes(boxes);

const getBoundingBoxWidth = (box: BoundingBox) => {
  return Math.max(1, box.x1 - box.x0);
};

const getBoundingBoxHeight = (box: BoundingBox) => {
  return Math.max(1, box.y1 - box.y0);
};

const getBoundingBoxAspectRatio = (box: BoundingBox) => {
  return getBoundingBoxWidth(box) / getBoundingBoxHeight(box);
};

const getBoundingBoxOverlapRatio = (
  left: BoundingBox,
  right: BoundingBox,
) => {
  const overlapWidth = Math.max(
    0,
    Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y1, right.y1) - Math.max(left.y0, right.y0),
  );
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  const overlapArea = overlapWidth * overlapHeight;
  const leftArea = Math.max(1, (left.x1 - left.x0) * (left.y1 - left.y0));
  const rightArea = Math.max(1, (right.x1 - right.x0) * (right.y1 - right.y0));
  return overlapArea / Math.min(leftArea, rightArea);
};

const getBestAnchorLineForSingleTokenField = (
  field: FieldKey,
  normalizedExpectedToken: string,
  ocrLines: OcrLine[],
): OcrLine | null => {
  let bestLine: OcrLine | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const line of ocrLines) {
    const coverage = getApproximateTokenCoverage([normalizedExpectedToken], line.text);
    if (coverage < 0.82) {
      continue;
    }

    const lineTokenCount = tokenizeNormalizedText(line.text).length;
    const unmatchedRatio = getUnmatchedCandidateTokenRatio(
      [normalizedExpectedToken],
      line.text,
    );
    const aspectRatio = getBoundingBoxAspectRatio(line.bbox);
    const aspectBonus = Math.min(0.24, (aspectRatio / 6) * 0.24);
    const extraTokenPenalty = Math.max(0, lineTokenCount - 3) * 0.05;
    const score =
      (coverage * 0.55) +
      (line.confidence * 0.2) +
      aspectBonus -
      (unmatchedRatio * 0.18) -
      extraTokenPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine;
};

const getProjectedTokenBoxFromLine = (
  line: OcrLine,
  normalizedExpectedToken: string,
  field: FieldKey,
): BoundingBox | null => {
  const tokenMatches = Array.from(line.text.matchAll(/\S+/g));
  if (tokenMatches.length === 0 || normalizedExpectedToken.length === 0) {
    return null;
  }

  let bestMatch: { start: number; end: number; similarity: number } | null = null;
  for (const match of tokenMatches) {
    const tokenText = normalizeText(match[0]);
    const similarity = diceCoefficient(normalizedExpectedToken, tokenText);
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        similarity,
      };
    }
  }

  if (!bestMatch || bestMatch.similarity < 0.58) {
    return null;
  }

  const lineWidth = Math.max(1, line.bbox.x1 - line.bbox.x0);
  const lineUnits = Math.max(1, line.text.length);
  const projectedX0 = line.bbox.x0 + (lineWidth * (bestMatch.start / lineUnits));
  const projectedX1 = line.bbox.x0 + (lineWidth * (bestMatch.end / lineUnits));
  const clampedProjectedX0 = Math.max(line.bbox.x0, Math.min(line.bbox.x1, projectedX0));
  const clampedProjectedX1 = Math.max(
    clampedProjectedX0,
    Math.min(line.bbox.x1, projectedX1),
  );

  if (field !== "class_type_designation") {
    if (field === "brand_name") {
      const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
      const lineCenterX = (line.bbox.x0 + line.bbox.x1) / 2;
      const projectedCenterX = (clampedProjectedX0 + clampedProjectedX1) / 2;
      const blendedCenterX = (projectedCenterX * 0.6) + (lineCenterX * 0.4);
      const tokenWidth = Math.max(8, clampedProjectedX1 - clampedProjectedX0);
      const adjustedWidth = Math.min(
        lineWidth * 0.72,
        Math.max(tokenWidth * 1.25, lineWidth * 0.26, lineHeight * 1.0),
      );
      const x0 = Math.max(line.bbox.x0, blendedCenterX - (adjustedWidth / 2));
      const x1 = Math.min(line.bbox.x1, blendedCenterX + (adjustedWidth / 2));
      const y0 = line.bbox.y0 + (lineHeight * 0.06);
      const y1 = line.bbox.y0 + (lineHeight * 0.64);

      return {
        x0,
        y0: Math.max(line.bbox.y0, y0),
        x1: Math.max(x0 + 1, x1),
        y1: Math.max(line.bbox.y0 + 1, Math.min(line.bbox.y1, y1)),
      };
    }

    return {
      x0: clampedProjectedX0,
      y0: line.bbox.y0,
      x1: clampedProjectedX1,
      y1: line.bbox.y1,
    };
  }

  const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
  const lineCenterX = (line.bbox.x0 + line.bbox.x1) / 2;
  const projectedCenterX = (clampedProjectedX0 + clampedProjectedX1) / 2;
  const blendedCenterX = (projectedCenterX * 0.35) + (lineCenterX * 0.65);
  const tokenWidth = Math.max(8, clampedProjectedX1 - clampedProjectedX0);
  const adjustedWidth = Math.min(
    lineWidth * 0.72,
    Math.max(tokenWidth * 1.35, lineWidth * 0.22, lineHeight * 1.1),
  );
  const x0 = Math.max(line.bbox.x0, blendedCenterX - (adjustedWidth / 2));
  const x1 = Math.min(line.bbox.x1, blendedCenterX + (adjustedWidth / 2));
  const y0 = line.bbox.y0 + (lineHeight * 0.56);
  const y1 = line.bbox.y0 + (lineHeight * 0.98);

  return {
    x0,
    y0: Math.max(line.bbox.y0, y0),
    x1: Math.max(x0 + 1, x1),
    y1: Math.max(line.bbox.y0 + 1, Math.min(line.bbox.y1, y1)),
  };
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

const ALCOHOL_CLASS_TOKENS = new Set([
  "gin",
  "vodka",
  "rum",
  "tequila",
  "mezcal",
  "brandy",
  "whiskey",
  "whisky",
  "scotch",
  "bourbon",
  "rye",
  "beer",
  "lager",
  "ale",
  "stout",
  "porter",
  "cider",
  "wine",
  "liqueur",
  "spirits",
]);

const getUnmatchedCandidateTokenRatio = (
  expectedTokens: string[],
  candidateText: string,
) => {
  const candidateTokens = tokenizeNormalizedText(candidateText);
  if (candidateTokens.length === 0 || expectedTokens.length === 0) {
    return 0;
  }

  let unmatchedCount = 0;
  for (const candidateToken of candidateTokens) {
    let bestSimilarity = 0;
    for (const expectedToken of expectedTokens) {
      const similarity = diceCoefficient(candidateToken, expectedToken);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    }
    if (bestSimilarity < 0.72) {
      unmatchedCount += 1;
    }
  }

  return unmatchedCount / candidateTokens.length;
};

const getBrandClassLeakPenalty = (
  expectedBrandValue: string,
  candidateText: string,
) => {
  const expectedTokens = new Set(tokenizeNormalizedText(expectedBrandValue));
  const candidateTokens = tokenizeNormalizedText(candidateText);

  let leakCount = 0;
  for (const token of candidateTokens) {
    if (!expectedTokens.has(token) && ALCOHOL_CLASS_TOKENS.has(token)) {
      leakCount += 1;
    }
  }

  return Math.min(0.5, leakCount * 0.28);
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

const getPageBounds = (ocrLines: OcrLine[], ocrTokens: OcrToken[]) => {
  const lineBoxes = ocrLines.map((line) => line.bbox);
  const tokenBoxes = ocrTokens.map((token) => token.bbox);
  return mergeBoxes([...lineBoxes, ...tokenBoxes]);
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
  } else if (field === "name_address") {
    filteredTokenLines = tokenLines.filter((line) => {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const isLowerRegion = lineCenterY >= maxY * 0.45;
      const hasAddressSignal =
        isAddressLikeText(line.text) || /,/.test(line.text) || /\d/.test(line.text);
      return isLowerRegion && hasAddressSignal;
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
    source: "line",
    tokenCount: filteredTokenLines.length,
  };
};

const getBestWordMatch = (
  field: FieldKey,
  expectedValue: string,
  ocrTokens: OcrToken[],
  pageBounds: BoundingBox | null,
): MatchCandidate | null => {
  if (ocrTokens.length === 0) {
    return null;
  }

  const expectedTokens = tokenizeNormalizedText(expectedValue);
  if (expectedTokens.length === 0) {
    return null;
  }

  const maxY = ocrTokens.reduce(
    (largestY, token) => Math.max(largestY, token.bbox.y1),
    1,
  );
  let candidateTokens = ocrTokens.filter((token) => token.text.trim().length > 0);

  if (field === "brand_name") {
    candidateTokens = candidateTokens.filter((token) => {
      const centerY = (token.bbox.y0 + token.bbox.y1) / 2;
      const isUpperRegion = centerY <= maxY * 0.72;
      return isUpperRegion && !isAddressLikeText(token.text);
    });
  }

  if (field === "name_address") {
    candidateTokens = candidateTokens.filter((token) => {
      return isAddressLikeText(token.text) || /,/.test(token.text) || /\d/.test(token.text);
    });
  }

  if (candidateTokens.length === 0) {
    return null;
  }

  const clusters = buildContiguousTokenClusters(candidateTokens);
  let bestCandidate: MatchCandidate | null = null;

  const evaluateTokenSequence = (sequence: OcrToken[]) => {
    const orderedCluster = sortTokensForReadingOrder(sequence);
    const maxWindow = Math.min(
      orderedCluster.length,
      field === "brand_name"
        ? Math.max(4, expectedTokens.length + 2)
        : Math.max(8, expectedTokens.length + 4),
    );

    for (let startIndex = 0; startIndex < orderedCluster.length; startIndex += 1) {
      for (
        let windowSize = 1;
        windowSize <= maxWindow && startIndex + windowSize <= orderedCluster.length;
        windowSize += 1
      ) {
        const slice = orderedCluster.slice(startIndex, startIndex + windowSize);
        const filteredSlice = removeOutlierTokens(slice);
        const candidateText = collapseWhitespace(
          filteredSlice.map((token) => token.text).join(" "),
        );
        if (candidateText.length === 0) {
          continue;
        }

        const tokenCoverage = getApproximateTokenCoverage(expectedTokens, candidateText);
        const minimumCoverage =
          field === "brand_name" && expectedTokens.length > 1 ? 0.7 : 0.45;
        if (tokenCoverage < minimumCoverage) {
          continue;
        }

        const similarity = diceCoefficient(expectedValue, candidateText);
        const includesExpected = normalizedIncludes(candidateText, expectedValue);
        const isSingleTokenClassDesignation =
          field === "class_type_designation" && expectedTokens.length === 1;
        const isSingleTokenCountryOfOrigin =
          field === "country_of_origin" && expectedTokens.length === 1;
        const unmatchedTokenRatio = getUnmatchedCandidateTokenRatio(
          expectedTokens,
          candidateText,
        );
        const includesBoost =
          includesExpected && field === "brand_name"
            ? Math.max(0.76, 0.99 - (unmatchedTokenRatio * 0.55))
            : includesExpected && isSingleTokenClassDesignation
              ? Math.max(0.72, 0.99 - (unmatchedTokenRatio * 0.72))
              : includesExpected && isSingleTokenCountryOfOrigin
                ? Math.max(0.76, 0.99 - (unmatchedTokenRatio * 0.62))
              : includesExpected
                ? 0.99
                : 0;
        const averageTokenConfidence = averageConfidence(
          filteredSlice.map((token) => ({
            text: token.text,
            confidence: token.confidence,
            bbox: token.bbox,
          })),
        );
        const candidateBox = mergeBoxes(filteredSlice.map((token) => token.bbox));
        if (!candidateBox || averageTokenConfidence === null) {
          continue;
        }

        const clampedBox = clampEvidenceBoxByField(
          field,
          candidateBox,
          filteredSlice.map((token) => token.bbox),
        );
        const areaRatio = computeEvidenceBoxAreaRatio(clampedBox, pageBounds);
        const oversizedPenalty = isEvidenceBoxOversized(field, areaRatio) ? 0.22 : 0;
        const windowPenalty = Math.max(0, windowSize - expectedTokens.length)
          * (
            field === "brand_name"
              ? 0.05
              : field === "class_type_designation"
                ? 0.06
                : field === "country_of_origin"
                  ? 0.05
                : 0.03
          );
        const baseScore =
          Math.max(similarity, includesBoost, tokenCoverage) * 0.75;
        let score = baseScore + (averageTokenConfidence * 0.25);

        if (field === "brand_name") {
          const uppercaseBonus = isMostlyUppercase(candidateText) ? 0.06 : 0;
          const addressPenalty = isAddressLikeText(candidateText) ? 0.45 : 0;
          const classLeakPenalty = getBrandClassLeakPenalty(expectedValue, candidateText);
          const unmatchedPenalty = unmatchedTokenRatio * 0.28;
          score += uppercaseBonus - addressPenalty - classLeakPenalty - unmatchedPenalty;
        }

        if (field === "class_type_designation") {
          const candidateCenterY = (clampedBox.y0 + clampedBox.y1) / 2;
          const topBias = Math.max(0, 1 - (candidateCenterY / maxY));
          const compactTokenBonus =
            expectedTokens.length === 1 && filteredSlice.length === 1 ? 0.16 : 0;
          const tokenBoxAspectRatio = getBoundingBoxWidth(clampedBox) / getBoundingBoxHeight(clampedBox);
          const verticalShapePenalty =
            expectedTokens.length === 1 && filteredSlice.length === 1 && tokenBoxAspectRatio < 0.9
              ? 0.26
              : 0;
          const spilloverPenalty =
            unmatchedTokenRatio * 0.35 +
            (expectedTokens.length === 1 ? Math.max(0, filteredSlice.length - 1) * 0.08 : 0);
          score += topBias * 0.08 + compactTokenBonus - spilloverPenalty - verticalShapePenalty;
        }

        if (field === "country_of_origin") {
          const candidateCenterY = (clampedBox.y0 + clampedBox.y1) / 2;
          const lowerBias = Math.max(0, (candidateCenterY / maxY) - 0.35);
          const compactTokenBonus =
            expectedTokens.length === 1 && filteredSlice.length === 1 ? 0.12 : 0;
          const spilloverPenalty =
            unmatchedTokenRatio * 0.34 +
            (expectedTokens.length === 1 ? Math.max(0, filteredSlice.length - 1) * 0.08 : 0);
          score += lowerBias * 0.08 + compactTokenBonus - spilloverPenalty;
        }

        score = score - windowPenalty - oversizedPenalty;

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            line: {
              text: candidateText,
              confidence: averageTokenConfidence,
              bbox: clampedBox,
            },
            score,
            source: "word",
            tokenCount: filteredSlice.length,
          };
        }
      }
    }
  };

  for (const cluster of clusters) {
    evaluateTokenSequence(cluster);
  }

  if (
    !bestCandidate &&
    field === "brand_name" &&
    expectedTokens.length > 1 &&
    candidateTokens.length > 1
  ) {
    // Brand words can be spaced apart beyond strict cluster gap thresholds.
    evaluateTokenSequence(candidateTokens);
  }

  const finalCandidate = bestCandidate as MatchCandidate | null;
  if (!finalCandidate) {
    return null;
  }

  if (finalCandidate.score < 0.42) {
    return null;
  }

  return finalCandidate;
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
    if (field === "name_address") {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      if (lineCenterY <= maxY * 0.45) {
        continue;
      }
    }

    const similarity = diceCoefficient(expectedValue, line.text);
    const includesMatch = normalizedIncludes(line.text, expectedValue);
    const normalizedLineText = normalizeText(line.text);
    const unmatchedTokenRatio = getUnmatchedCandidateTokenRatio(
      normalizedTokens,
      line.text,
    );
    const lineTokenCount = tokenizeNormalizedText(line.text).length;
    const expectedContainsLine =
      normalizedIncludes(expectedValue, line.text) &&
      (normalizedLineText.length >= 4 || lineTokenCount >= 2);
    const classSingleTokenIncludesBoost =
      field === "class_type_designation" &&
      normalizedTokens.length === 1 &&
      includesMatch
        ? Math.max(0.72, 0.99 - (unmatchedTokenRatio * 0.72))
        : 0;
    const countrySingleTokenIncludesBoost =
      field === "country_of_origin" &&
      normalizedTokens.length === 1 &&
      includesMatch
        ? Math.max(0.76, 0.99 - (unmatchedTokenRatio * 0.62))
        : 0;

    const lineScoreBase = Math.max(
      similarity,
      classSingleTokenIncludesBoost > 0
        ? classSingleTokenIncludesBoost
        : countrySingleTokenIncludesBoost > 0
          ? countrySingleTokenIncludesBoost
        : includesMatch
          ? 0.99
          : 0,
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
      const unmatchedPenalty = unmatchedTokenRatio * 0.2;
      const classLeakPenalty = getBrandClassLeakPenalty(expectedValue, line.text);
      lineScore =
        (lineScore * 0.7) +
        (tokenCoverage * 0.3) +
        (Math.max(0, topBias) * 0.08) +
        uppercaseBonus -
        longLinePenalty -
        addressPenalty -
        unmatchedPenalty -
        classLeakPenalty;
    }

    if (field === "name_address") {
      if (isAddressLikeText(line.text)) {
        lineScore += 0.22;
      }
      if (/,/.test(line.text) || /\d/.test(line.text)) {
        lineScore += 0.08;
      }
      if (tokenCoverage < 0.35) {
        lineScore -= 0.22;
      }
      if (normalizedLineText.length < 6) {
        lineScore -= 0.18;
      }
    }

    if (field === "class_type_designation") {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const topBias = Math.max(0, 1 - (lineCenterY / maxY));
      const compactTokenBonus =
        normalizedTokens.length === 1 && lineTokenCount === 1 ? 0.16 : 0;
      const spilloverPenalty =
        unmatchedTokenRatio * 0.36 +
        (normalizedTokens.length === 1 ? Math.max(0, lineTokenCount - 1) * 0.08 : 0);
      lineScore += topBias * 0.08 + compactTokenBonus - spilloverPenalty;
    }

    if (field === "country_of_origin") {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const lowerBias = Math.max(0, (lineCenterY / maxY) - 0.35);
      const compactTokenBonus =
        normalizedTokens.length === 1 && lineTokenCount === 1 ? 0.12 : 0;
      const spilloverPenalty =
        unmatchedTokenRatio * 0.34 +
        (normalizedTokens.length === 1 ? Math.max(0, lineTokenCount - 1) * 0.08 : 0);
      lineScore += lowerBias * 0.08 + compactTokenBonus - spilloverPenalty;
    }

    if (!bestCandidate || lineScore > bestCandidate.score) {
      bestCandidate = {
        line,
        score: lineScore,
        source: "line",
        tokenCount: Math.max(1, line.text.trim().split(/\s+/).length),
      };
    }
  }

  const aggregateCandidate =
    field === "brand_name" || field === "name_address"
      ? getAggregateMatchCandidate(field, expectedValue, ocrLines)
      : null;
  if (aggregateCandidate) {
    const preferAggregateForAddress =
      field === "name_address" &&
      bestCandidate !== null &&
      aggregateCandidate.tokenCount >= Math.max(4, bestCandidate.tokenCount + 2) &&
      aggregateCandidate.score >= bestCandidate.score - 0.2;

    if (
      !bestCandidate ||
      aggregateCandidate.score > bestCandidate.score ||
      preferAggregateForAddress
    ) {
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
  let warningStartIndex = ocrLines.findIndex((line) =>
    normalizedIncludes(line.text, "government warning"),
  );

  if (warningStartIndex < 0) {
    const maxY = ocrLines.reduce((largest, line) => Math.max(largest, line.bbox.y1), 1);
    warningStartIndex = ocrLines.findIndex((line) => {
      const lineCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const isLowerRegion = lineCenterY >= maxY * 0.45;
      const hasWarningAnchor =
        normalizedIncludes(line.text, "government") ||
        normalizedIncludes(line.text, "warning");
      return isLowerRegion && hasWarningAnchor;
    });
  }

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
    const fullExtractedWarning = collapseWhitespace(
      ocrLines.map((line) => line.text).join(" "),
    );
    const fullWarningSimilarity = diceCoefficient(expectedValue, fullExtractedWarning);
    const fullHasClauseMarkers =
      fullExtractedWarning.includes("(1)") && fullExtractedWarning.includes("(2)");
    const fullMentionsSurgeonGeneral = normalizedIncludes(
      fullExtractedWarning,
      "surgeon general",
    );

    if (
      fullWarningSimilarity >= 0.62 ||
      (fullHasClauseMarkers && fullMentionsSurgeonGeneral)
    ) {
      return {
        field: "government_warning",
        label: FIELD_LABELS.government_warning,
        applicationValue: formatApplicationValue(expectedValue),
        extractedValue: fullExtractedWarning,
        status: "Needs Review",
        confidence: averageConfidence(ocrLines),
        reason:
          "Warning-like text was detected across the label, but the canonical anchor phrase was fragmented in OCR lines.",
        evidenceBox: mergeBoxes(ocrLines.map((line) => line.bbox)),
      };
    }

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

  const warningSlice = ocrLines.slice(warningStartIndex, warningStartIndex + 60);
  const warningAnchorLine = ocrLines[warningStartIndex];
  const medianHeight = getMedianLineHeight(ocrLines);
  const anchorCenterY = warningAnchorLine ? getLineCenterY(warningAnchorLine) : 0;
  const warningCandidateLines = ocrLines.filter((line) => {
    return getLineCenterY(line) >= anchorCenterY - (medianHeight * 0.6);
  });
  const orderedWarningLines = sortLinesForWarningReadingOrder(
    warningCandidateLines.length > 0 ? warningCandidateLines : warningSlice,
  );
  const extractedWarning = orderedWarningLines.map((line) => line.text).join(" ");
  const collapsedExtractedWarning = collapseWhitespace(extractedWarning);
  const collapsedExpectedWarning = collapseWhitespace(expectedValue);
  const extractedPrefix = collapsedExtractedWarning.slice(0, WARNING_PREFIX.length + 2);
  const uppercasePrefixPresent = extractedPrefix.startsWith(WARNING_PREFIX);
  const expectedWarningBody = stripWarningPrefix(collapsedExpectedWarning);
  const extractedWarningBody = stripWarningPrefix(collapsedExtractedWarning);
  const normalizedExpectedWarningBody =
    normalizeWarningBodyForComparison(expectedWarningBody);
  const normalizedExtractedWarningBody =
    normalizeWarningBodyForComparison(extractedWarningBody);
  const exactWarningBodyMatch =
    normalizedExtractedWarningBody.length > 0 &&
    isExpectedTokenSequencePresent(
      normalizedExpectedWarningBody,
      normalizedExtractedWarningBody,
    );
  const hasClauseMarkers =
    collapsedExtractedWarning.includes("(1)") &&
    collapsedExtractedWarning.includes("(2)");
  const warningSimilarity = diceCoefficient(expectedValue, extractedWarning);
  const warningConfidence = averageConfidence(orderedWarningLines);

  if (exactWarningBodyMatch && uppercasePrefixPresent) {
    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: collapsedExtractedWarning,
      status: "Pass",
      confidence: warningConfidence,
      reason:
        "Government warning matched required uppercase prefix and exact wording.",
      evidenceBox: mergeBoxes(orderedWarningLines.map((line) => line.bbox)),
    };
  }

  const warningDetectedConfidently =
    warningConfidence !== null && warningConfidence >= 0.7;
  if (warningDetectedConfidently) {
    const mismatchReasons: string[] = [];
    if (!uppercasePrefixPresent) {
      mismatchReasons.push("missing required uppercase 'GOVERNMENT WARNING:' prefix");
    }
    if (!exactWarningBodyMatch) {
      mismatchReasons.push("warning body does not exactly match required wording");
    }
    const mismatchReason =
      mismatchReasons.length > 0
        ? mismatchReasons.join("; ")
        : "warning text does not satisfy strict formatting requirements";

    return {
      field: "government_warning",
      label: FIELD_LABELS.government_warning,
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: collapsedExtractedWarning,
      status: "Fail",
      confidence: warningConfidence,
      reason: `Warning was detected with high confidence but is non-compliant: ${mismatchReason}.`,
      evidenceBox: mergeBoxes(orderedWarningLines.map((line) => line.bbox)),
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
      evidenceBox: mergeBoxes(orderedWarningLines.map((line) => line.bbox)),
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
    evidenceBox: mergeBoxes(orderedWarningLines.map((line) => line.bbox)),
  };
};

const verifyTextField = (
  expectation: FieldExpectation,
  ocrLines: OcrLine[],
  ocrTokens: OcrToken[],
  pageBounds: BoundingBox | null,
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
      evidenceSource: "none",
      evidenceTokenCount: 0,
      evidenceBoxAreaRatio: null,
      evidenceOversized: false,
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
      evidenceSource: "none",
      evidenceTokenCount: 0,
      evidenceBoxAreaRatio: null,
      evidenceOversized: false,
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
      evidenceSource: "none",
      evidenceTokenCount: 0,
      evidenceBoxAreaRatio: null,
      evidenceOversized: false,
    };
  }

  const wordCandidate = getBestWordMatch(
    expectation.field,
    expectedValue,
    ocrTokens,
    pageBounds,
  );
  const lineCandidate = getBestLineMatch(expectation.field, expectedValue, ocrLines);
  const expectedTokens = tokenizeNormalizedText(expectedValue);
  const expectedTokenCount = expectedTokens.length;
  const lineAreaRatio = lineCandidate
    ? computeEvidenceBoxAreaRatio(lineCandidate.line.bbox, pageBounds)
    : null;
  const lineOversized = lineCandidate
    ? isEvidenceBoxOversized(expectation.field, lineAreaRatio)
    : false;

  let matchCandidate: MatchCandidate | null = lineCandidate;
  if (wordCandidate && !lineCandidate) {
    matchCandidate = wordCandidate;
  } else if (wordCandidate && lineCandidate) {
    if (expectation.field === "brand_name") {
      const preferWordForMultiWordBrand =
        expectedTokenCount > 1 &&
        wordCandidate.tokenCount >= Math.min(2, expectedTokenCount);

      if (preferWordForMultiWordBrand) {
        matchCandidate = wordCandidate;
      } else if (lineOversized || isAddressLikeText(lineCandidate.line.text)) {
        matchCandidate = wordCandidate;
      } else if (wordCandidate.score >= lineCandidate.score - 0.02) {
        matchCandidate = wordCandidate;
      }
    } else if (
      expectation.field === "class_type_designation" ||
      expectation.field === "country_of_origin"
    ) {
      const wordTokenCount = tokenizeNormalizedText(wordCandidate.line.text).length;
      const lineTokenCount = tokenizeNormalizedText(lineCandidate.line.text).length;
      const wordBoxAspectRatio =
        getBoundingBoxWidth(wordCandidate.line.bbox) /
        getBoundingBoxHeight(wordCandidate.line.bbox);
      const wordCoverage = getApproximateTokenCoverage(
        expectedTokens,
        wordCandidate.line.text,
      );
      const singleTokenSpatialMismatch =
        expectedTokenCount === 1 &&
        wordTokenCount === 1 &&
        lineTokenCount === 1 &&
        getBoundingBoxOverlapRatio(wordCandidate.line.bbox, lineCandidate.line.bbox) < 0.22;
      const preferCompactWordMatch =
        expectedTokenCount === 1 &&
        wordTokenCount === 1 &&
        lineTokenCount > 1 &&
        wordCoverage >= 0.95;
      const suspiciousCompactWordMatch =
        expectedTokenCount === 1 &&
        wordTokenCount === 1 &&
        wordBoxAspectRatio < 0.9 &&
        lineTokenCount === 1;
      const projectedCompactWordBox =
        expectation.field === "class_type_designation" &&
        expectedTokenCount === 1 &&
        wordTokenCount === 1 &&
        wordBoxAspectRatio < 0.9 &&
        lineTokenCount > 1
          ? getProjectedTokenBoxFromLine(
              lineCandidate.line,
              expectedTokens[0],
              expectation.field,
            )
          : null;

      if (projectedCompactWordBox) {
        matchCandidate = {
          ...wordCandidate,
          score: Math.max(wordCandidate.score, lineCandidate.score - 0.02),
          line: {
            ...wordCandidate.line,
            bbox: projectedCompactWordBox,
          },
        };
      } else if (singleTokenSpatialMismatch || suspiciousCompactWordMatch) {
        matchCandidate = lineCandidate;
      } else if (preferCompactWordMatch) {
        matchCandidate = wordCandidate;
      } else if (
        wordCandidate.score >= lineCandidate.score - 0.04 &&
        wordTokenCount < lineTokenCount
      ) {
        matchCandidate = wordCandidate;
      } else if (
        (lineOversized && wordCandidate.score >= lineCandidate.score - 0.03) ||
        wordCandidate.score >= lineCandidate.score + 0.08
      ) {
        matchCandidate = wordCandidate;
      }
    } else if (
      (lineOversized && wordCandidate.score >= lineCandidate.score - 0.03) ||
      wordCandidate.score >= lineCandidate.score + 0.08
    ) {
      matchCandidate = wordCandidate;
    }
  }

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
      evidenceSource: "none",
      evidenceTokenCount: 0,
      evidenceBoxAreaRatio: null,
      evidenceOversized: false,
    };
  }

  const shouldRepairSingleTokenFieldEvidence =
    expectedTokenCount === 1 &&
    (expectation.field === "brand_name" ||
      expectation.field === "class_type_designation") &&
    tokenizeNormalizedText(matchCandidate.line.text).length === 1;
  if (shouldRepairSingleTokenFieldEvidence) {
    const currentAspectRatio = getBoundingBoxAspectRatio(matchCandidate.line.bbox);
    if (currentAspectRatio < 1.05) {
      const anchorLine =
        getBestAnchorLineForSingleTokenField(
          expectation.field,
          expectedTokens[0],
          ocrLines,
        ) ??
        lineCandidate?.line ??
        null;
      if (anchorLine) {
        const projectedBox = getProjectedTokenBoxFromLine(
          anchorLine,
          expectedTokens[0],
          expectation.field,
        );
        if (
          projectedBox &&
          getBoundingBoxAspectRatio(projectedBox) > currentAspectRatio + 0.2
        ) {
          matchCandidate = {
            ...matchCandidate,
            line: {
              ...matchCandidate.line,
              bbox: projectedBox,
            },
          };
        }
      }
    }
  }

  const resolvedConfidence = calibratedConfidence(
    matchCandidate.line.confidence,
    matchCandidate.score,
  );
  const matchedTokenCoverage = getApproximateTokenCoverage(
    tokenizeNormalizedText(expectedValue),
    matchCandidate.line.text,
  );
  const areaRatio = computeEvidenceBoxAreaRatio(matchCandidate.line.bbox, pageBounds);
  const oversized = isEvidenceBoxOversized(expectation.field, areaRatio);
  const extractedTokenSpilloverRatio = getUnmatchedCandidateTokenRatio(
    expectedTokens,
    matchCandidate.line.text,
  );
  const singleTokenSpilloverDetected =
    (expectation.field === "class_type_designation" ||
      expectation.field === "country_of_origin") &&
    expectedTokenCount === 1 &&
    extractedTokenSpilloverRatio > 0.34;
  const evidenceReasonPrefix = oversized
    ? "Evidence area is larger than expected and may include adjacent text. "
    : "";
  const passCoverageThreshold = expectedTokenCount > 2 ? 0.55 : 0.35;
  const passScoreThreshold =
    expectation.field === "brand_name"
      ? 0.93
      : expectation.field === "class_type_designation" && expectedTokenCount === 1
        ? 0.82
        : 0.9;
  const passConfidenceThreshold = expectation.field === "brand_name" ? 0.92 : 0.55;

  if (
    matchCandidate.score >= passScoreThreshold &&
    matchCandidate.line.confidence >= passConfidenceThreshold &&
    matchedTokenCoverage >= passCoverageThreshold &&
    !singleTokenSpilloverDetected
  ) {
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: matchCandidate.line.text,
      status: "Pass",
      confidence: resolvedConfidence,
      reason:
        `${evidenceReasonPrefix}Detected text strongly matches the application value at a high confidence threshold.`,
      evidenceBox: matchCandidate.line.bbox,
      evidenceSource: matchCandidate.source,
      evidenceTokenCount: matchCandidate.tokenCount,
      evidenceBoxAreaRatio: areaRatio,
      evidenceOversized: oversized,
    };
  }

  if (matchCandidate.score >= 0.75) {
    const closeMatchReason = singleTokenSpilloverDetected
      ? `${evidenceReasonPrefix}Detected field text includes extra adjacent label words and needs manual confirmation.`
      : `${evidenceReasonPrefix}Detected text is close to expected but below strict pass threshold.`;
    return {
      field: expectation.field,
      label: FIELD_LABELS[expectation.field],
      applicationValue: formatApplicationValue(expectedValue),
      extractedValue: matchCandidate.line.text,
      status: "Needs Review",
      confidence: resolvedConfidence,
      reason: closeMatchReason,
      evidenceBox: matchCandidate.line.bbox,
      evidenceSource: matchCandidate.source,
      evidenceTokenCount: matchCandidate.tokenCount,
      evidenceBoxAreaRatio: areaRatio,
      evidenceOversized: oversized,
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
      `${evidenceReasonPrefix}Detected text does not match the application value under conservative matching rules.`,
    evidenceBox: matchCandidate.line.bbox,
    evidenceSource: matchCandidate.source,
    evidenceTokenCount: matchCandidate.tokenCount,
    evidenceBoxAreaRatio: areaRatio,
    evidenceOversized: oversized,
  };
};

const verifyAlcoholField = (
  expectation: FieldExpectation,
  application: CanonicalApplication,
  ocrLines: OcrLine[],
  ocrTokens: OcrToken[],
  pageBounds: BoundingBox | null,
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
    return verifyTextField(expectation, ocrLines, ocrTokens, pageBounds);
  }

  const expectedAlcohol = parseAlcoholContent(expectedValue);
  if (!expectedAlcohol) {
    return verifyTextField(expectation, ocrLines, ocrTokens, pageBounds);
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
        source: "line",
        tokenCount: Math.max(1, line.text.trim().split(/\s+/).length),
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
  ocrTokens: OcrToken[],
  pageBounds: BoundingBox | null,
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
      reason: "Required net contents value is missing in application JSON.",
      evidenceBox: null,
    };
  }

  if (!expectedValue) {
    return verifyTextField(expectation, ocrLines, ocrTokens, pageBounds);
  }

  const expectedNetContents = parseNetContents(expectedValue);
  if (!expectedNetContents) {
    return verifyTextField(expectation, ocrLines, ocrTokens, pageBounds);
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
        source: "line",
        tokenCount: Math.max(1, line.text.trim().split(/\s+/).length),
      };
      bestParsedNetContents = parsedNetContents;
      bestDifferenceMl = differenceMl;
    }
  }

  if (!bestCandidate || !bestParsedNetContents) {
    for (let index = 0; index < ocrLines.length - 1; index += 1) {
      const firstLine = ocrLines[index];
      const secondLine = ocrLines[index + 1];
      const combinedText = `${firstLine.text} ${secondLine.text}`;
      const parsedPair = parseNetContents(combinedText);
      if (!parsedPair) {
        continue;
      }

      const pairDifferenceMl = Math.abs(expectedNetContents.volumeMl - parsedPair.volumeMl);
      const pairConfidence = averageConfidence([firstLine, secondLine]) ?? 0;

      if (pairDifferenceMl <= 6) {
        return {
          field: expectation.field,
          label: FIELD_LABELS[expectation.field],
          applicationValue: formatApplicationValue(expectedValue),
          extractedValue: `${combinedText} (${parsedPair.volumeMl.toFixed(1)} mL normalized)`,
          status: pairDifferenceMl <= 3 ? "Pass" : "Needs Review",
          confidence: pairConfidence,
          reason:
            "Net contents was reconstructed from adjacent OCR lines because numeric value and unit were split.",
          evidenceBox: mergeBoxes([firstLine.bbox, secondLine.bbox]),
        };
      }
    }

    const fullTextNetContents = parseNetContents(fullOcrText);
    if (fullTextNetContents) {
      const differenceMl = Math.abs(
        expectedNetContents.volumeMl - fullTextNetContents.volumeMl,
      );
      return {
        field: expectation.field,
        label: FIELD_LABELS[expectation.field],
        applicationValue: formatApplicationValue(expectedValue),
        extractedValue: `Detected across OCR lines (${fullTextNetContents.value} ${fullTextNetContents.unit})`,
        status: differenceMl <= 15 ? "Needs Review" : "Fail",
        confidence: averageConfidence(ocrLines),
        reason:
          "Net contents was detected from combined OCR text, but token-level evidence was fragmented.",
        evidenceBox: null,
      };
    }

    // Fallback: OCR often captures "750" but misses "ML" on curved labels.
    // If numeric volume is very close to expected, downgrade to review instead
    // of hard-missing so operators can quickly confirm.
    const numericOnlyCandidate = ocrLines
      .map((line) => {
        const numberMatch = line.text.match(/(\d{2,4}(?:\.\d+)?)/);
        if (!numberMatch) {
          return null;
        }

        const parsedValue = Number(numberMatch[1]);
        if (!Number.isFinite(parsedValue)) {
          return null;
        }

        const differenceMl = Math.abs(expectedNetContents.volumeMl - parsedValue);
        return { line, parsedValue, differenceMl };
      })
      .filter(
        (
          candidate,
        ): candidate is { line: OcrLine; parsedValue: number; differenceMl: number } =>
          candidate !== null,
      )
      .sort((left, right) => {
        if (left.differenceMl !== right.differenceMl) {
          return left.differenceMl - right.differenceMl;
        }
        return right.line.confidence - left.line.confidence;
      })[0];

    if (numericOnlyCandidate && numericOnlyCandidate.differenceMl <= 12) {
      return {
        field: expectation.field,
        label: FIELD_LABELS[expectation.field],
        applicationValue: formatApplicationValue(expectedValue),
        extractedValue: `${numericOnlyCandidate.line.text} (unit unclear)`,
        status: "Needs Review",
        confidence: numericOnlyCandidate.line.confidence,
        reason:
          "Detected numeric net-contents value is close to expected, but OCR did not confidently capture the unit.",
        evidenceBox: numericOnlyCandidate.line.bbox,
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
  ocrTokens: OcrToken[] = [],
): VerificationFieldResult[] => {
  const pageBounds = getPageBounds(ocrLines, ocrTokens);
  const regularFieldResults = getFieldExpectations(application).map((expectation) => {
    if (expectation.field === "alcohol_content") {
      return verifyAlcoholField(
        expectation,
        application,
        ocrLines,
        ocrTokens,
        pageBounds,
      );
    }

    if (expectation.field === "net_contents") {
      return verifyNetContentsField(
        expectation,
        application,
        ocrLines,
        ocrTokens,
        pageBounds,
      );
    }

    return verifyTextField(expectation, ocrLines, ocrTokens, pageBounds);
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
