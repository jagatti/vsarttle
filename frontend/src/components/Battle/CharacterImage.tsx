"use client";

import { useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { FALLBACK_CHARACTER_IMAGE_URL, resolveCharacterImageUrl } from "@/lib/imageUrl";

const BLANK_CHECK_MAX_SIZE = 512;

/**
 * Renders the loaded image onto a canvas and reports whether every pixel is
 * fully transparent (e.g. a drawing that only contains white-on-transparent
 * or erased strokes). Any failure is treated as "not blank" so a real
 * drawing is never replaced by mistake.
 */
function isLoadedImageBlank(image: HTMLImageElement): boolean {
  try {
    const width = Math.min(image.naturalWidth || BLANK_CHECK_MAX_SIZE, BLANK_CHECK_MAX_SIZE);
    const height = Math.min(image.naturalHeight || BLANK_CHECK_MAX_SIZE, BLANK_CHECK_MAX_SIZE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

type CharacterImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

/**
 * `<img>` for fighter portraits that always shows something: missing, invalid,
 * blank or failing images are swapped for a fallback silhouette.
 */
export function CharacterImage({ src, onError, onLoad, alt, ...rest }: CharacterImageProps) {
  const resolvedSrc = resolveCharacterImageUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const displaySrc = failedSrc === resolvedSrc ? FALLBACK_CHARACTER_IMAGE_URL : resolvedSrc;

  const markFailed = () => {
    if (resolvedSrc !== FALLBACK_CHARACTER_IMAGE_URL) setFailedSrc(resolvedSrc);
  };

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (displaySrc !== FALLBACK_CHARACTER_IMAGE_URL) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[CharacterImage] image failed to load; showing fallback", { alt });
      }
      markFailed();
    }
    onError?.(event);
  };

  const handleLoad = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    const image = event.currentTarget;
    if (displaySrc !== FALLBACK_CHARACTER_IMAGE_URL && isLoadedImageBlank(image)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[CharacterImage] image has no visible pixels; showing fallback", { alt });
      }
      markFailed();
    }
    onLoad?.(event);
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...rest} alt={alt} src={displaySrc} data-fallback={displaySrc === FALLBACK_CHARACTER_IMAGE_URL ? "true" : undefined} onError={handleError} onLoad={handleLoad} />
  );
}
