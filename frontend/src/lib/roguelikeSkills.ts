import type { PlayerBattleState } from "@/types/game";

export type SkillId =
  | "smallHeal" | "mediumHeal" | "largeHeal"
  | "attackResistance" | "magicResistance" | "barrierResistance"
  | "tieBoost" | "ppRegen" | "statusResistance" | "filter" | "ppAbsorb" | "hpRegen"
  | "pursuit" | "fightSpirit" | "guts"
  | "shortBattle" | "enhancedMagic" | "extraStatus" | "underdog";

export type AcquiredSkills = Partial<Record<SkillId, number>>;

export interface RoguelikeSkillEffects {
  attackResistance?: number;
  magicResistance?: number;
  barrierResistance?: number;
  tieBoost?: boolean;
  ppRegen?: boolean;
  statusResistance?: boolean;
  filter?: boolean;
  ppAbsorb?: boolean;
  hpRegen?: boolean;
  pursuit?: boolean;
  fightSpirit?: boolean;
  guts?: boolean;
  shortBattle?: boolean;
  enhancedMagic?: boolean;
  extraStatus?: boolean;
  underdog?: boolean;
}

export const ROGUELIKE_SKILL_BALANCE = {
  healRatios: { smallHeal: 0.3, mediumHeal: 0.55, largeHeal: 0.85 },
  resistancePerStack: 0.1,
  maxResistanceStacks: 3,
  tieDamageMultiplier: 1.1,
  tieChargeRecovery: 0.35,
  autoRecoveryRatio: 0.05,
  statusResistanceChance: 0.5,
  ppAbsorbRatio: 0.2,
  healthyRecoveryWeight: 0.3,
  healthyHpRatio: 0.9,
  lowHpRatio: 0.4,
} as const;

export interface RoguelikeSkill {
  id: SkillId;
  label: string;
  description: string;
  rarity: 1 | 2 | 3;
  maxStacks: number;
  consumable: boolean;
}

export const ROGUELIKE_SKILLS: Record<SkillId, RoguelikeSkill> = {
  smallHeal: { id: "smallHeal", label: "小回復", description: "HPとPPを最大値の30%回復する（使い切り）。", rarity: 1, maxStacks: 1, consumable: true },
  mediumHeal: { id: "mediumHeal", label: "中回復", description: "HPとPPを最大値の55%回復する（使い切り）。", rarity: 2, maxStacks: 1, consumable: true },
  largeHeal: { id: "largeHeal", label: "大回復", description: "HPとPPを最大値の85%回復する（使い切り）。", rarity: 3, maxStacks: 1, consumable: true },
  attackResistance: { id: "attackResistance", label: "こうげき耐性", description: "こうげきの被ダメージを10%軽減する（最大3重）。", rarity: 1, maxStacks: ROGUELIKE_SKILL_BALANCE.maxResistanceStacks, consumable: false },
  magicResistance: { id: "magicResistance", label: "まほう耐性", description: "まほうの被ダメージを10%軽減する（最大3重）。", rarity: 1, maxStacks: ROGUELIKE_SKILL_BALANCE.maxResistanceStacks, consumable: false },
  barrierResistance: { id: "barrierResistance", label: "バリア耐性", description: "バリア同士の衝突・一方的なバリア・反射の被ダメージを10%軽減する（最大3重）。", rarity: 1, maxStacks: ROGUELIKE_SKILL_BALANCE.maxResistanceStacks, consumable: false },
  tieBoost: { id: "tieBoost", label: "あいこ強化", description: "あいこ時、与ダメージが10%増加する。チャージ同士のときは、回復量が25%→35%になる。", rarity: 1, maxStacks: 1, consumable: false },
  ppRegen: { id: "ppRegen", label: "PP自動回復", description: "毎ターン終了時に最大PPの5%を回復する。", rarity: 2, maxStacks: 1, consumable: false },
  statusResistance: { id: "statusResistance", label: "異常耐性", description: "弱まほうの状態異常を50%の確率で無効化する。", rarity: 2, maxStacks: 1, consumable: false },
  filter: { id: "filter", label: "フィルター", description: "各バトルの1ターン目のすべての被ダメージを0にする（痛み分けを含む。状態異常は防がない）。", rarity: 2, maxStacks: 1, consumable: false },
  ppAbsorb: { id: "ppAbsorb", label: "PP吸収", description: "バリアでまほうを反射したときだけ、相手が実際に消費したPPの20%を回復する（端数切り上げ）。", rarity: 2, maxStacks: 1, consumable: false },
  hpRegen: { id: "hpRegen", label: "HP自動回復", description: "毎ターン終了時に最大HPの5%を回復する。", rarity: 3, maxStacks: 1, consumable: false },
  pursuit: { id: "pursuit", label: "追撃", description: "相手がまひ、またはチャージ状態のとき、追加で50ダメージを与える。", rarity: 1, maxStacks: 1, consumable: false },
  fightSpirit: { id: "fightSpirit", label: "闘争心", description: "バランス型が相手の時、与えるダメージと受けるダメージが20%アップする。", rarity: 2, maxStacks: 1, consumable: false },
  guts: { id: "guts", label: "根性", description: "HPが0になるダメージを受けたとき、一度だけHP1で耐える（1ランにつき1回）。", rarity: 3, maxStacks: 1, consumable: false },
  shortBattle: { id: "shortBattle", label: "短期決戦", description: "層内ターン11以降、与ダメージ・被ダメージが常時2倍。21以降は常時3倍。（協力では2人に適用）", rarity: 1, maxStacks: 1, consumable: false },
  enhancedMagic: { id: "enhancedMagic", label: "強化魔法", description: "まほうの消費PP+25%（その分まほうの威力も上がる）。", rarity: 2, maxStacks: 1, consumable: false },
  extraStatus: { id: "extraStatus", label: "異常追加", description: "弱まほうで付与する状態異常が+1。（習得効果が2個以上必要）", rarity: 2, maxStacks: 1, consumable: false },
  underdog: { id: "underdog", label: "下克上", description: "自分の最大HPが敵より低いとき、与ダメージ+50%。", rarity: 3, maxStacks: 1, consumable: false },
};

function skillStacks(acquired: AcquiredSkills, skill: RoguelikeSkill): number {
  const count = acquired[skill.id] ?? 0;
  return Number.isFinite(count) ? Math.min(skill.maxStacks, Math.max(0, Math.floor(count))) : 0;
}

export function getRoguelikeSkillDisabledReason(acquired: AcquiredSkills, skillId: SkillId): string | null {
  const skill = ROGUELIKE_SKILLS[skillId];
  if (skill.consumable || skillStacks(acquired, skill) < skill.maxStacks) return null;
  return skill.maxStacks === 1 ? "取得済み" : "取得上限";
}

export function buildRoguelikeSkillEffects(acquired: AcquiredSkills): RoguelikeSkillEffects {
  const effects: RoguelikeSkillEffects = {};
  for (const skill of Object.values(ROGUELIKE_SKILLS)) {
    const stacks = skillStacks(acquired, skill);
    if (skill.consumable || stacks === 0) continue;
    switch (skill.id) {
      case "attackResistance":
      case "magicResistance":
      case "barrierResistance":
        effects[skill.id] = stacks;
        break;
      case "tieBoost":
      case "ppRegen":
      case "statusResistance":
      case "filter":
      case "ppAbsorb":
      case "hpRegen":
      case "pursuit":
      case "fightSpirit":
      case "guts":
      case "shortBattle":
      case "enhancedMagic":
      case "extraStatus":
      case "underdog":
        effects[skill.id] = true;
    }
  }
  return effects;
}

export function applyRoguelikeSkillReward(
  player: PlayerBattleState,
  skillId: SkillId,
  acquired: AcquiredSkills,
): { player: PlayerBattleState; acquiredSkills: AcquiredSkills } {
  const skill = ROGUELIKE_SKILLS[skillId];
  const acquiredSkills = { ...acquired };
  if (skill.consumable) {
    delete acquiredSkills[skillId];
    const ratio = ROGUELIKE_SKILL_BALANCE.healRatios[skillId as keyof typeof ROGUELIKE_SKILL_BALANCE.healRatios];
    return {
      player: {
        ...player,
        currentHp: Math.min(player.stats.maxHp, player.currentHp + Math.ceil(player.stats.maxHp * ratio)),
        currentPp: Math.min(player.stats.maxPp, player.currentPp + Math.ceil(player.stats.maxPp * ratio)),
      },
      acquiredSkills,
    };
  }
  acquiredSkills[skillId] = Math.min(skill.maxStacks, skillStacks(acquired, skill) + 1);
  return { player, acquiredSkills };
}

export function applyRoguelikeAutoRecovery(
  player: PlayerBattleState,
  effects: RoguelikeSkillEffects,
): PlayerBattleState {
  if (player.currentHp <= 0 || (!effects.hpRegen && !effects.ppRegen)) return player;
  return {
    ...player,
    currentHp: effects.hpRegen
      ? Math.max(player.currentHp, Math.min(player.stats.maxHp, player.currentHp + Math.ceil(player.stats.maxHp * ROGUELIKE_SKILL_BALANCE.autoRecoveryRatio)))
      : player.currentHp,
    currentPp: effects.ppRegen
      ? Math.max(player.currentPp, Math.min(player.stats.maxPp, player.currentPp + Math.ceil(player.stats.maxPp * ROGUELIKE_SKILL_BALANCE.autoRecoveryRatio)))
      : player.currentPp,
  };
}

export function buildRoguelikeSkillsTooltip(acquired: AcquiredSkills): string {
  const entries = Object.values(ROGUELIKE_SKILLS).flatMap((skill) => {
    const stacks = skillStacks(acquired, skill);
    if (skill.consumable || stacks === 0) return [];
    const count = skill.maxStacks > 1 ? ` ×${stacks}` : "";
    return [`${skill.label}${count}: ${skill.description}`];
  });
  return entries.length ? entries.join("\n") : "まだスキルを習得していません";
}

export function buildRoguelikeSkillLabels(
  acquired: AcquiredSkills,
  gutsUsed = false,
  acquiredHealingSkills: AcquiredSkills = {},
): string[] {
  return Object.values(ROGUELIKE_SKILLS).flatMap((skill) => {
    const count = skill.consumable ? acquiredHealingSkills[skill.id] ?? 0 : skillStacks(acquired, skill);
    if (!Number.isFinite(count) || count < 1) return [];
    if (skill.id === "guts") return [`${skill.label}x${gutsUsed ? 0 : 1}`];
    return [`${skill.label}${skill.consumable || skill.maxStacks > 1 ? ` x${Math.floor(count)}` : ""}`];
  });
}
