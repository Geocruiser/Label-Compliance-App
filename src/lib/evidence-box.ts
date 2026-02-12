import type { BoundingBox, FieldKey, OcrToken } from "@/lib/types";

const getBoxHeight = (box: BoundingBox) => {
  return Math.max(1, box.y1 - box.y0);
};

const getBoxWidth = (box: BoundingBox) => {
  return Math.max(1, box.x1 - box.x0);
};

const getTokenCenter = (token: OcrToken) => {
  return {
    x: (token.bbox.x0 + token.bbox.x1) / 2,
    y: (token.bbox.y0 + token.bbox.y1) / 2,
  };
};

const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

export const mergeEvidenceBoxes = (boxes: BoundingBox[]): BoundingBox | null => {
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

export const getBoxArea = (box: BoundingBox | null) => {
  if (!box) {
    return 0;
  }

  return getBoxWidth(box) * getBoxHeight(box);
};

export const sortTokensForReadingOrder = (tokens: OcrToken[]) => {
  return [...tokens].sort((left, right) => {
    const leftCenter = getTokenCenter(left);
    const rightCenter = getTokenCenter(right);
    const medianHeight = median(tokens.map((token) => getBoxHeight(token.bbox)));
    const sameLineThreshold = Math.max(10, medianHeight * 0.8);

    if (Math.abs(leftCenter.y - rightCenter.y) <= sameLineThreshold) {
      return leftCenter.x - rightCenter.x;
    }

    return leftCenter.y - rightCenter.y;
  });
};

export const removeOutlierTokens = (tokens: OcrToken[]) => {
  if (tokens.length <= 2) {
    return tokens;
  }

  const centersY = tokens.map((token) => getTokenCenter(token).y);
  const centersX = tokens.map((token) => getTokenCenter(token).x);
  const heights = tokens.map((token) => getBoxHeight(token.bbox));

  const medianY = median(centersY);
  const medianX = median(centersX);
  const medianHeight = Math.max(8, median(heights));
  const verticalRange = medianHeight * 3.5;
  const horizontalRange = medianHeight * 20;

  const filteredTokens = tokens.filter((token) => {
    const center = getTokenCenter(token);
    const withinVertical = Math.abs(center.y - medianY) <= verticalRange;
    const withinHorizontal = Math.abs(center.x - medianX) <= horizontalRange;
    return withinVertical && withinHorizontal;
  });

  return filteredTokens.length === 0 ? tokens : filteredTokens;
};

export const buildContiguousTokenClusters = (tokens: OcrToken[]) => {
  if (tokens.length === 0) {
    return [];
  }

  const sortedTokens = sortTokensForReadingOrder(tokens);
  const medianHeight = Math.max(
    8,
    median(sortedTokens.map((token) => getBoxHeight(token.bbox))),
  );
  const maxVerticalGap = medianHeight * 1.4;
  const maxHorizontalGap = medianHeight * 3.2;

  const clusters: OcrToken[][] = [];
  let currentCluster: OcrToken[] = [sortedTokens[0]];

  for (let index = 1; index < sortedTokens.length; index += 1) {
    const previousToken = sortedTokens[index - 1];
    const currentToken = sortedTokens[index];
    const previousCenter = getTokenCenter(previousToken);
    const currentCenter = getTokenCenter(currentToken);

    const verticalGap = Math.abs(currentCenter.y - previousCenter.y);
    const horizontalGap = Math.abs(currentCenter.x - previousCenter.x);

    if (verticalGap <= maxVerticalGap && horizontalGap <= maxHorizontalGap) {
      currentCluster.push(currentToken);
      continue;
    }

    clusters.push(currentCluster);
    currentCluster = [currentToken];
  }

  clusters.push(currentCluster);
  return clusters.map((cluster) => removeOutlierTokens(cluster));
};

export const clampEvidenceBoxByField = (
  field: FieldKey,
  box: BoundingBox,
  tokenBoxes: BoundingBox[],
) => {
  const tokenUnion = mergeEvidenceBoxes(tokenBoxes);
  if (!tokenUnion) {
    return box;
  }

  if (field === "brand_name" || field === "class_type_designation") {
    const medianHeight = Math.max(
      8,
      median(tokenBoxes.map((tokenBox) => getBoxHeight(tokenBox))),
    );
    const maxHeight = Math.max(medianHeight * 3.5, getBoxHeight(tokenUnion) * 1.1);
    const centerY = (tokenUnion.y0 + tokenUnion.y1) / 2;
    const halfHeight = maxHeight / 2;

    return {
      x0: tokenUnion.x0,
      x1: tokenUnion.x1,
      y0: Math.max(box.y0, centerY - halfHeight),
      y1: Math.min(box.y1, centerY + halfHeight),
    };
  }

  return box;
};

export const computeEvidenceBoxAreaRatio = (
  evidenceBox: BoundingBox | null,
  pageBounds: BoundingBox | null,
) => {
  if (!evidenceBox || !pageBounds) {
    return null;
  }

  const pageArea = getBoxArea(pageBounds);
  if (pageArea <= 0) {
    return null;
  }

  return getBoxArea(evidenceBox) / pageArea;
};

export const isEvidenceBoxOversized = (
  field: FieldKey,
  areaRatio: number | null,
) => {
  if (areaRatio === null) {
    return false;
  }

  const thresholds: Record<FieldKey, number> = {
    brand_name: 0.2,
    class_type_designation: 0.25,
    alcohol_content: 0.2,
    net_contents: 0.2,
    name_address: 0.45,
    country_of_origin: 0.2,
    government_warning: 0.7,
  };

  return areaRatio > thresholds[field];
};
