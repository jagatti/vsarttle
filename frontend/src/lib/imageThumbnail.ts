const MAX_THUMBNAIL_BYTES = 250_000;

export async function createThumbnailFromImageSource(source: string, size = 128): Promise<string> {
  if (typeof window === "undefined" || !source) return source;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const result = renderThumbnail(image, size);
      if (result !== null) {
        resolve(result);
        return;
      }
      // Rendering failed; try fallback compression on the original source
      resolve(compressFallback(source));
    };
    image.onerror = () => resolve(compressFallback(source));
    image.src = source;
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
    return canvas.toDataURL("image/png");
  } catch {
    return null;
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
