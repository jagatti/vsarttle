export async function createThumbnailFromImageSource(source: string, size = 128): Promise<string> {
  if (typeof window === "undefined" || !source) return source;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }
        context.clearRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(source);
      }
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}
