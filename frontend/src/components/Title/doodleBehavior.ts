import type { DrawingSlot } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { FALLBACK_CHARACTER_IMAGE_URL, resolveCharacterImageUrl } from "@/lib/imageUrl";

export type DoodleAction = "rest" | "sway" | "look" | "walk" | "hop" | "retreat" | "tilt" | "attack" | "magic";
export type DoodleReaction = "single" | "multi" | "profile" | null;
export interface DoodlePose {
  action: DoodleAction;
  facing: number;
  position: number;
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
  return Array.from({ length: count }, (_, i) => ({
    action: "rest", facing: i === 0 ? 1 : -1, position: i === 0 ? 0.12 : 0.88,
  }));
}

export function restDuration(random = Math.random): number {
  return 1000 + random() * 1800;
}

export function reactionStep(count: number, reaction: DoodleReaction, poses = restingPoses(count)): DoodleStep {
  return {
    poses: poses.map((pose, i) => ({
      ...pose,
      action: pose.position < 0 || pose.position > 1 ? "rest"
        : reaction === "single" ? "attack" : reaction ? "look" : "rest",
      facing: reaction === "profile" ? 1 : reaction === "multi" && count === 2
        ? (poses[1 - i].position >= pose.position ? 1 : -1) : pose.facing,
    })),
    duration: 1000,
  };
}

export type DoodleScenario = "spar" | "magic" | "chase" | "visit" | "wander" | "solo";
export interface DoodleGround {
  travel: number;
  size: number;
}

export function chooseScenario(count: number, random = Math.random): DoodleScenario {
  const choices: [DoodleScenario, number][] = count === 2
    ? [["spar", 4], ["magic", 2], ["chase", 3], ["visit", 2], ["wander", 1]]
    : [["wander", 4], ["visit", 2], ["solo", 4]];
  let ticket = random() * choices.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [name, weight] of choices) {
    ticket -= weight;
    if (ticket < 0) return name;
  }
  return choices[choices.length - 1][0];
}

export function scenarioSteps(
  scenario: DoodleScenario, initial: DoodlePose[], ground: DoodleGround,
  actor = 0, random = Math.random,
): DoodleStep[] {
  if (!initial.length) return [];
  const travel = Math.max(1, ground.travel);
  const gap = Math.min(0.22, ground.size * 0.44 / travel);
  const outside = (ground.size + 16) / travel;
  const partner = 1 - actor;
  let poses = initial.map((pose) => ({ ...pose, action: "rest" as DoodleAction }));
  const steps: DoodleStep[] = [];
  const step = (updates: Partial<DoodlePose>[], duration: number) => {
    const next = poses.map((pose, i) => ({ ...pose, action: "rest" as DoodleAction, ...updates[i] }));
    // Keep long trips gentle even on wide screens (at most 75px per second).
    const walkingTime = Math.max(...next.map((pose, i) => Math.abs(pose.position - poses[i].position) * travel / 75 * 1000));
    steps.push({ poses: next, duration: duration === 0 ? 0 : Math.max(duration, walkingTime) });
    poses = next;
  };
  const move = (positions: number[], duration = 1600) => step(positions.map((position, i) => ({
    position, action: position === poses[i].position ? "rest" : "walk",
    facing: position === poses[i].position ? poses[i].facing : position > poses[i].position ? 1 : -1,
  })), duration);
  const act = (action: DoodleAction, response: DoodleAction, duration: number) =>
    step(poses.map((_, i) => ({ action: i === actor ? action : response })), duration);
  const faceEachOther = () => step(poses.map((pose, i) => ({
    action: "look", facing: poses[1 - i].position >= pose.position ? 1 : -1,
  })), 700);

  if (initial.length === 2 && (scenario === "spar" || scenario === "magic")) {
    faceEachOther();
    move([0.5 - gap, 0.5 + gap]);
    faceEachOther();
    step([], 800);
    act(scenario === "magic" ? "magic" : "attack", "rest", 850);
    act("look", scenario === "magic" ? "hop" : "retreat", 750);
    step([], 900);
    move(random() < 0.5 ? [0.16, 0.84] : [0.27, 0.73]);
  } else if (initial.length === 2 && scenario === "chase") {
    faceEachOther();
    act("hop", "look", 700);
    const direction = random() < 0.5 ? 1 : -1;
    const left = direction === 1 ? 0.55 : 0.16;
    const positions = [left, left + gap * 2.3];
    if (actor === 1) positions.reverse();
    move(positions);
    step([], 700);
    move(positions.map((position) => position - direction * 0.15));
    act("hop", "hop", 800);
    step([], 700);
  } else if (scenario === "visit") {
    const exitLeft = poses[actor].position < 0.5;
    const exit = exitLeft ? -outside : 1 + outside;
    step(poses.map((_, i) => i === actor ? { action: "look" } : {}), 650);
    move(poses.map((pose, i) => i === actor ? exit : pose.position));
    act("rest", "tilt", 2500 + random() * 2000);
    const enterLeft = random() < 0.5;
    // Only change edges while the visitor and its shadow are completely off-stage.
    step(poses.map((_, i) => i === actor ? {
      position: enterLeft ? -outside : 1 + outside, facing: enterLeft ? 1 : -1,
    } : {}), 0);
    let destination = enterLeft ? 0.2 : 0.8;
    if (poses.length === 2 && Math.abs(poses[partner].position - destination) < gap * 2) {
      destination = poses[partner].position + (enterLeft ? 1 : -1) * gap * 2.2;
    }
    move(poses.map((pose, i) => i === actor ? destination : pose.position));
    act("hop", "retreat", 850);
    step([], 650);
  } else {
    const positions = poses.map((pose, i) => i === actor
      ? (initial.length === 1 ? 0.2 + random() * 0.6 : i === 0 ? 0.2 + random() * 0.12 : 0.68 + random() * 0.12)
      : pose.position);
    act("look", "rest", 650);
    move(positions);
    step([], 650);
    act(scenario === "solo" ? (random() < 0.5 ? "attack" : "magic") : "hop", "look", 950);
    act("tilt", "rest", 700);
  }
  return steps;
}
