import type { DrawingSlot } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { FALLBACK_CHARACTER_IMAGE_URL, resolveCharacterImageUrl } from "@/lib/imageUrl";

export type DoodleAction = "rest" | "sway" | "look" | "walk" | "hop" | "retreat" | "tilt" | "attack" | "magic";
export type DoodleReaction = "single" | "multi" | "profile" | null;
export interface DoodlePose {
  action: DoodleAction;
  facing: number;
  offset?: number;
}
export interface DoodleStep {
  poses: DoodlePose[];
  duration: number;
}

export function selectTitleDoodles(slots: (DrawingSlot | null)[], random = Math.random): string[] {
  const images = slots.flatMap((slot) => {
    if (!slot) return [];
    try {
      const image = resolveCharacterImageUrl(drawingToDataUrl(slot.drawingData));
      return image === FALLBACK_CHARACTER_IMAGE_URL ? [] : [image];
    } catch {
      return [];
    }
  });
  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [images[i], images[j]] = [images[j], images[i]];
  }
  return images.slice(0, 2);
}

export function restingPoses(count: number): DoodlePose[] {
  return Array.from({ length: count }, (_, i) => ({ action: "rest", facing: i === 0 ? 1 : -1 }));
}

export function restDuration(random = Math.random): number {
  return 4000 + random() * 5000;
}

const EVENTS: DoodleAction[] = ["walk", "look", "hop", "retreat", "tilt", "attack", "magic"];

export function idleStep(poses: DoodlePose[], random = Math.random): DoodleStep {
  const actor = Math.floor(random() * poses.length);
  const action = random() < 0.18 ? EVENTS[Math.floor(random() * EVENTS.length)] : "sway";
  return {
    poses: poses.map((pose, i) => i === actor
      ? { action, facing: random() < 0.15 ? -pose.facing : pose.facing }
      : { ...pose, action: "rest" }),
    duration: action === "sway" ? 2400 : 1600,
  };
}

export function reactionStep(count: number, reaction: DoodleReaction): DoodleStep {
  return {
    poses: restingPoses(count).map((pose) => ({
      ...pose,
      action: reaction === "single" ? "attack" : reaction ? "look" : "rest",
      facing: reaction === "profile" ? 1 : pose.facing,
    })),
    duration: 1600,
  };
}

export function encounterSteps(surprised: boolean, actor = 0): DoodleStep[] {
  const base = restingPoses(2);
  const step = (actionA: DoodleAction, actionB: DoodleAction, duration: number, approach = false): DoodleStep => ({
    poses: base.map((pose, i) => ({
      ...pose,
      action: i === actor ? actionA : actionB,
      offset: approach ? (i === actor ? 8 : surprised && actionB === "retreat" ? -5 : 0) * pose.facing : 0,
    })),
    duration,
  });
  return [
    step("look", "rest", 900),
    step("rest", "look", 900),
    step("walk", "rest", 1600, true),
    step("rest", surprised ? "retreat" : "hop", 1600, true),
    step("rest", "rest", 1800, true),
    step("rest", "rest", 1600),
  ];
}
