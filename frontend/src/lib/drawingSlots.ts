import type { DrawingData } from "@/types/game";

export interface DrawingSlot {
  drawingData: DrawingData;
  /** Small dataURL (JPEG) used as thumbnail preview. */
  thumbnail: string;
}

export const SLOT_COUNT = 3;
const SLOTS_KEY = "arttle_drawing_slots";

/**
 * Reads all save-slot entries from localStorage.
 * Returns an array of exactly SLOT_COUNT entries; empty slots are `null`.
 */
export function loadSlots(): (DrawingSlot | null)[] {
  if (typeof window === "undefined") return Array<null>(SLOT_COUNT).fill(null);
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return Array<null>(SLOT_COUNT).fill(null);
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return Array<null>(SLOT_COUNT).fill(null);
    const result: (DrawingSlot | null)[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const entry = parsed[i];
      result.push(isDrawingSlot(entry) ? entry : null);
    }
    return result;
  } catch {
    return Array<null>(SLOT_COUNT).fill(null);
  }
}

/**
 * Persists the full slots array to localStorage.
 */
export function persistSlots(slots: (DrawingSlot | null)[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore.
  }
}

function isDrawingSlot(value: unknown): value is DrawingSlot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.thumbnail === "string" &&
    v.drawingData !== null &&
    typeof v.drawingData === "object"
  );
}

/**
 * Creates a thumbnail dataURL by scaling the given canvas element down to
 * `size × size` pixels.  Returns an empty string when canvas is unavailable.
 */
export function createThumbnail(canvas: HTMLCanvasElement, size = 120): string {
  try {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(canvas, 0, 0, size, size);
    return offscreen.toDataURL("image/jpeg", 0.8);
  } catch {
    return "";
  }
}
