export function safeImageUrl(value: string): string {
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("/")) return value;
  return "";
}

const FALLBACK_CHARACTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">' +
  '<g fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="64" cy="30" r="16" fill="#94a3b8" />' +
  '<polyline points="64,46 64,84" />' +
  '<polyline points="36,60 64,56 92,60" />' +
  '<polyline points="42,116 64,84 86,116" />' +
  "</g></svg>";

/**
 * Silhouette shown whenever a character's own image is missing, blank, invalid
 * or fails to load, so a fighter is never rendered as an invisible image.
 */
export const FALLBACK_CHARACTER_IMAGE_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(FALLBACK_CHARACTER_SVG)}`;

const SVG_DRAWABLE_ELEMENT = /<(?:path|polyline|polygon|line|rect|circle|ellipse|image|text|use)\b/i;

function decodeSvgDataUrl(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const header = value.slice(0, commaIndex).toLowerCase();
  if (!header.startsWith("data:image/svg+xml")) return null;
  const body = value.slice(commaIndex + 1);
  try {
    return header.includes(";base64") ? atob(body) : decodeURIComponent(body);
  } catch {
    return null;
  }
}

/**
 * True when `value` is an SVG data URL that draws nothing, e.g. the
 * `<svg ...></svg>` produced from an empty drawing (time ran out before
 * drawing) or a drawing whose strokes were all erased. Masks are ignored
 * because they never paint by themselves.
 */
export function isBlankSvgDataUrl(value: string): boolean {
  const svg = decodeSvgDataUrl(value);
  if (svg === null || !/<svg\b/i.test(svg)) return false;
  const withoutMasks = svg.replace(/<mask\b[\s\S]*?<\/mask>/gi, "");
  return !SVG_DRAWABLE_ELEMENT.test(withoutMasks);
}

function hasEmptyDataPayload(value: string): boolean {
  if (!value.startsWith("data:")) return false;
  const commaIndex = value.indexOf(",");
  return commaIndex < 0 || commaIndex === value.length - 1;
}

/**
 * Returns a URL that is safe to render and is expected to show something.
 * Missing, non-whitelisted or blank images resolve to the fallback silhouette.
 */
export function resolveCharacterImageUrl(value: string | null | undefined): string {
  if (typeof value !== "string") return FALLBACK_CHARACTER_IMAGE_URL;
  const safe = safeImageUrl(value.trim());
  if (!safe || safe === "/" || hasEmptyDataPayload(safe) || isBlankSvgDataUrl(safe)) return FALLBACK_CHARACTER_IMAGE_URL;
  return safe;
}
