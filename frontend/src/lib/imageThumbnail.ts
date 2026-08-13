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
 * Last-resort fallback: if the source is already small enough, return it as-is.
 * Otherwise try re-encoding as a low-quality JPEG at a small fixed size.
 */
function compressFallback(source: string): string {
  if (source.length <= MAX_THUMBNAIL_BYTES) return source;
  console.error(
    "[imageThumbnail] createThumbnailFromImageSource failed to compress source; attempting low-quality JPEG re-encode.",
    { sourceLength: source.length },
  );
  try {
    const img = new Image();
    img.src = source;
    // If the image is already loaded (same-origin data URL), encode immediately
    if (img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, 64, 64);
        const compressed = canvas.toDataURL("image/jpeg", 0.3);
        if (compressed.length <= MAX_THUMBNAIL_BYTES) return compressed;
      }
    }
  } catch {
    // ignore
  }
  // Return a truncated slice only if absolutely nothing else works
  // (this path should be extremely rare — the image is genuinely un-encodable)
  return source.slice(0, MAX_THUMBNAIL_BYTES);
}
