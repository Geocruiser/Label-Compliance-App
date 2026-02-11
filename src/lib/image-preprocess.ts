const MAX_DIMENSION = 2200;

type PreprocessResult = {
  blob: Blob;
  steps: string[];
};

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

const toBlob = (canvas: HTMLCanvasElement) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode canvas image."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
};

const loadImageBitmap = async (image: Blob) => {
  return createImageBitmap(image);
};

const scaleDimensions = (width: number, height: number) => {
  const largestSide = Math.max(width, height);
  if (largestSide <= MAX_DIMENSION) {
    return { width, height, wasResized: false };
  }

  const scale = MAX_DIMENSION / largestSide;
  return {
    width: width * scale,
    height: height * scale,
    wasResized: true,
  };
};

const applyBoxBlur = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const blurred = new Uint8ClampedArray(pixels.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          sum += pixels[(ny * width) + nx];
          count += 1;
        }
      }

      blurred[(y * width) + x] = Math.round(sum / Math.max(1, count));
    }
  }

  return blurred;
};

const computeHistogram = (pixels: Uint8ClampedArray) => {
  const histogram = new Array<number>(256).fill(0);
  for (let index = 0; index < pixels.length; index += 1) {
    histogram[pixels[index]] += 1;
  }

  return histogram;
};

const percentileIntensity = (
  histogram: number[],
  pixelCount: number,
  percentile: number,
) => {
  const threshold = pixelCount * percentile;
  let runningTotal = 0;

  for (let intensity = 0; intensity < histogram.length; intensity += 1) {
    runningTotal += histogram[intensity];
    if (runningTotal >= threshold) {
      return intensity;
    }
  }

  return histogram.length - 1;
};

const computeOtsuThreshold = (histogram: number[], totalPixels: number) => {
  let sum = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    sum += index * histogram[index];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let index = 0; index < histogram.length; index += 1) {
    weightBackground += histogram[index];
    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) {
      break;
    }

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const betweenClassVariance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) *
      (meanBackground - meanForeground);

    if (betweenClassVariance > maxVariance) {
      maxVariance = betweenClassVariance;
      threshold = index;
    }
  }

  return threshold;
};

const rotateCanvasByDegrees = (canvas: HTMLCanvasElement, degrees: number) => {
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  if (![90, 180, 270].includes(normalizedDegrees)) {
    return canvas;
  }

  const isRightAngle = normalizedDegrees === 90 || normalizedDegrees === 270;
  const rotatedCanvas = createCanvas(
    isRightAngle ? canvas.height : canvas.width,
    isRightAngle ? canvas.width : canvas.height,
  );
  const context = rotatedCanvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.save();
  if (normalizedDegrees === 90) {
    context.translate(rotatedCanvas.width, 0);
  } else if (normalizedDegrees === 180) {
    context.translate(rotatedCanvas.width, rotatedCanvas.height);
  } else {
    context.translate(0, rotatedCanvas.height);
  }

  context.rotate((normalizedDegrees * Math.PI) / 180);
  context.drawImage(canvas, 0, 0);
  context.restore();
  return rotatedCanvas;
};

export const preprocessImageForOcr = async (image: Blob): Promise<PreprocessResult> => {
  const imageBitmap = await loadImageBitmap(image);
  const dimensions = scaleDimensions(imageBitmap.width, imageBitmap.height);
  const canvas = createCanvas(dimensions.width, dimensions.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize canvas context for OCR preprocessing.");
  }

  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const pixelCount = canvas.width * canvas.height;
  const grayscale = new Uint8ClampedArray(pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const rgbaIndex = pixelIndex * 4;
    const red = data[rgbaIndex];
    const green = data[rgbaIndex + 1];
    const blue = data[rgbaIndex + 2];
    grayscale[pixelIndex] = Math.round((0.299 * red) + (0.587 * green) + (0.114 * blue));
  }

  const denoised = applyBoxBlur(grayscale, canvas.width, canvas.height);
  const histogram = computeHistogram(denoised);
  const lowIntensity = percentileIntensity(histogram, pixelCount, 0.02);
  const highIntensity = percentileIntensity(histogram, pixelCount, 0.98);
  const contrastRange = Math.max(1, highIntensity - lowIntensity);
  const contrastStretched = new Uint8ClampedArray(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const stretched = ((denoised[index] - lowIntensity) * 255) / contrastRange;
    contrastStretched[index] = Math.max(0, Math.min(255, Math.round(stretched)));
  }

  const stretchedHistogram = computeHistogram(contrastStretched);
  const otsuThreshold = computeOtsuThreshold(stretchedHistogram, pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const rgbaIndex = pixelIndex * 4;
    const currentValue = contrastStretched[pixelIndex];
    let outputValue = currentValue;

    if (currentValue >= otsuThreshold + 8) {
      outputValue = 255;
    } else if (currentValue <= otsuThreshold - 8) {
      outputValue = 0;
    }

    data[rgbaIndex] = outputValue;
    data[rgbaIndex + 1] = outputValue;
    data[rgbaIndex + 2] = outputValue;
    data[rgbaIndex + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  const steps: string[] = [];
  if (dimensions.wasResized) {
    steps.push("resized_for_ocr");
  }
  steps.push("grayscale");
  steps.push("denoise_box_blur");
  steps.push("contrast_stretch");
  steps.push("adaptive_threshold");

  return {
    blob: await toBlob(canvas),
    steps,
  };
};

export const rotateImageBlob = async (image: Blob, degrees: number) => {
  const imageBitmap = await loadImageBitmap(image);
  const baseCanvas = createCanvas(imageBitmap.width, imageBitmap.height);
  const baseContext = baseCanvas.getContext("2d");
  if (!baseContext) {
    throw new Error("Unable to initialize canvas context for image rotation.");
  }

  baseContext.drawImage(imageBitmap, 0, 0);
  const rotatedCanvas = rotateCanvasByDegrees(baseCanvas, degrees);
  return toBlob(rotatedCanvas);
};
