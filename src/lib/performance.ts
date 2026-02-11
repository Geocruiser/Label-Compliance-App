export const percentile = (values: number[], percentileValue: number) => {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const boundedPercentile = Math.max(0, Math.min(100, percentileValue));
  const index = Math.ceil((boundedPercentile / 100) * sortedValues.length) - 1;
  const safeIndex = Math.max(0, Math.min(sortedValues.length - 1, index));
  return sortedValues[safeIndex];
};

export const mean = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, current) => total + current, 0) / values.length;
};

export const summarizeDurations = (durationsMs: number[]) => {
  if (durationsMs.length === 0) {
    return {
      sampleSize: 0,
      p50Ms: null,
      p95Ms: null,
      averageMs: null,
      minMs: null,
      maxMs: null,
    };
  }

  return {
    sampleSize: durationsMs.length,
    p50Ms: percentile(durationsMs, 50),
    p95Ms: percentile(durationsMs, 95),
    averageMs: mean(durationsMs),
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
  };
};
