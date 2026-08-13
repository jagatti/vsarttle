const MAX_THUMBNAIL_BYTES = 250_000;
const MIN_VALID_THUMBNAIL_LENGTH = 1_200;

export function isBlankThumbnail(dataUrl: string, options?: { fullyTransparent?: boolean }): boolean {
  if (options?.fullyTransparent) return true;
  if (!dataUrl.startsWith("data:image/")) return false;
  return dataUrl.length < MIN_VALID_THUMBNAIL_LENGTH;
}

export async function createThumbnailFromImageSource(source: string, size = 128): Promise<string> {
  if (typeof window === "undefined" || !source) return source;
  try {
    const image = new Image();
    image.src = source;
    await waitForImageReady(image);
    const result = renderThumbnail(image, size);
    if (result === null || isBlankThumbnail(result)) return compressFallback(source);
    return result;
  } catch {
    return compressFallback(source);
  }
}

async function waitForImageReady(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("failed_to_load_image"));
  });
}

function renderThumbnail(image: HTMLImageElement, size: number): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    const fullyTransparent = isCanvasFullyTransparent(context, size);
    const dataUrl = canvas.toDataURL("image/png");
    if (isBlankThumbnail(dataUrl, { fullyTransparent })) return null;
    return dataUrl;
  } catch {
    return null;
  }
}

function isCanvasFullyTransparent(context: CanvasRenderingContext2D, size: number): boolean {
  try {
    const { data } = context.getImageData(0, 0, size, size);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * A guaranteed-valid 1×1 grey PNG, used as a placeholder when all thumbnail
 * generation paths fail. Generated once with:
 *   const c = document.createElement("canvas"); c.width = c.height = 1;
 *   const ctx = c.getContext("2d"); ctx.fillStyle="#888"; ctx.fillRect(0,0,1,1);
 *   c.toDataURL("image/png")
 */
const PLACEHOLDER_THUMBNAIL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Fallback thumbnail generator.
 * 1. Try to decode the source image with image.decode() and re-encode as a
 *    64×64 JPEG (quality 0.3).  If that fits within MAX_THUMBNAIL_BYTES, return it.
 * 2. If source is already small enough AND looks like a valid data URL, return it.
 * 3. Otherwise return the hard-coded placeholder PNG — never a truncated string.
 */
async function compressFallback(source: string): Promise<string> {
  try {
    const img = new Image();
    img.src = source;
    await waitForImageReady(img);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, 64, 64);
      const compressed = canvas.toDataURL("image/jpeg", 0.3);
      if (compressed.length <= MAX_THUMBNAIL_BYTES) return compressed;
    }
  } catch {
    // decode / draw failed — fall through
  }

  if (source.length <= MAX_THUMBNAIL_BYTES && source.startsWith("data:image/")) {
    return source;
  }

  console.error(
    "[imageThumbnail] compressFallback: all compression paths failed; returning placeholder.",
    { sourceLength: source.length },
  );
  return PLACEHOLDER_THUMBNAIL;
}
