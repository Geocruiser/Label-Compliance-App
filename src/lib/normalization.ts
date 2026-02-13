const MULTI_SPACE_REGEX = /\s+/g;
const NON_ALNUM_SPACE_REGEX = /[^a-z0-9\s]/gi;

export const collapseWhitespace = (value: string) => {
  return value.trim().replace(MULTI_SPACE_REGEX, " ");
};

export const normalizeText = (value: string) => {
  return collapseWhitespace(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_ALNUM_SPACE_REGEX, "");
};

const buildBigrams = (value: string) => {
  const normalized = normalizeText(value);
  if (normalized.length <= 1) {
    return new Set([normalized]);
  }

  const bigrams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.add(normalized.slice(index, index + 2));
  }

  return bigrams;
};

export const diceCoefficient = (left: string, right: string) => {
  const leftSet = buildBigrams(left);
  const rightSet = buildBigrams(right);

  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      intersectionCount += 1;
    }
  });

  return (2 * intersectionCount) / (leftSet.size + rightSet.size);
};

export const normalizedIncludes = (haystack: string, needle: string) => {
  return normalizeText(haystack).includes(normalizeText(needle));
};
