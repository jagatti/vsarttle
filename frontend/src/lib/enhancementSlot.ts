import type { CharacterStats, EnhancementSlot } from "@/types/game";

export const ENHANCEMENT_SLOT_META: Record<EnhancementSlot, { icon: string; label: string; effectText: string }> = {
  pp: { icon: "✨", label: "PP強化", effectText: "PP+1" },
  speed: { icon: "👟", label: "速度強化", effectText: "速度+2" },
  evasion: { icon: "💨", label: "回避強化", effectText: "回避+4%" },
};

export const ENHANCEMENT_SLOT_CHOICES: EnhancementSlot[] = ["pp", "speed", "evasion"];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function applyEnhancementSlot(stats: CharacterStats, slot: EnhancementSlot): CharacterStats {
  if (slot === "pp") {
    const maxPp = stats.maxPp + 1;
    return { ...stats, pp: maxPp, maxPp };
  }
  if (slot === "speed") {
    return { ...stats, speed: stats.speed + 2 };
  }
  return { ...stats, evasion: clamp(Number((stats.evasion + 0.04).toFixed(3)), 0, 0.95) };
}
