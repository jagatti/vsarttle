import type {
  ActionType,
  CharacterStats,
  PlayerBattleState,
  VoidminationBossForm,
} from "@/types/game";

export type RoguelikeVoidDominationEffectKind =
  | "magicDamper"
  | "painShare"
  | "reverseVelocity"
  | "overcharge"
  | "typeChange"
  | "colorDrain"
  | "inevitableZone";

export interface RoguelikeVoidDominationSpec {
  floor: number;
  kind: RoguelikeVoidDominationEffectKind;
  name: string;
  badgeText: string;
  description: string;
}

const TYPE_CHANGE_FORMS: VoidminationBossForm[] = ["attack", "magic", "defense"];

const VOID_DOMINATION_SPECS: Record<number, RoguelikeVoidDominationSpec> = {
  5: {
    floor: 5,
    kind: "magicDamper",
    name: "ヴォイドミネーション",
    badgeText: "マジックダンパー",
    description: "ボスが受けるまほうダメージを25%軽減する。",
  },
  10: {
    floor: 10,
    kind: "painShare",
    name: "ヴォイドミネーション",
    badgeText: "ペインシェア",
    description: "受けたダメージの20%を相手にも返す。返りダメージは連鎖しない。",
  },
  13: {
    floor: 13,
    kind: "reverseVelocity",
    name: "ヴォイドミネーション",
    badgeText: "リバース・ヴェロシティ",
    description: "速度が遅いほうが先に行動する。同速時の処理は通常どおり。",
  },
  16: {
    floor: 16,
    kind: "overcharge",
    name: "ヴォイドミネーション",
    badgeText: "オーバーチャージ",
    description: "ボスのチャージHP回復が5%になり、PPは最大PPぶん回復して2倍まで蓄積。まほうPP消費は25%/50%になる。",
  },
  17: {
    floor: 17,
    kind: "typeChange",
    name: "ヴォイドミネーション",
    badgeText: "タイプチェンジ",
    description: "ボスが3ターンごとにこうげき型・まほう型・バリア型へ変化する。",
  },
  18: {
    floor: 18,
    kind: "colorDrain",
    name: "ヴォイドミネーション",
    badgeText: "カラードレイン",
    description: "発動時にプレイヤーの最大HP/PPを15%下げ、そのぶんボスが回復する。",
  },
  19: {
    floor: 19,
    kind: "inevitableZone",
    name: "ヴォイドミネーション",
    badgeText: "イネビタブルゾーン",
    description: "両者の回避率を0%にし、すべての技が必中になる。",
  },
};

export function getRoguelikeVoidDominationSourceFloor(floor: number): number | null {
  if (floor === 20) return 19;
  return VOID_DOMINATION_SPECS[floor] ? floor : null;
}

export function getRoguelikeVoidDominationSpec(floor: number): RoguelikeVoidDominationSpec | null {
  const sourceFloor = getRoguelikeVoidDominationSourceFloor(floor);
  return sourceFloor ? VOID_DOMINATION_SPECS[sourceFloor] : null;
}

export function getVoidminationThreshold(maxHp: number): number {
  return Math.floor(maxHp * 0.66);
}

export function resolveVoidminationDamage(params: {
  currentHp: number;
  maxHp: number;
  incomingDamage: number;
  alreadyUsed: boolean;
}): { nextHp: number; damageTaken: number; triggered: boolean } {
  const threshold = getVoidminationThreshold(params.maxHp);
  if (!params.alreadyUsed && params.currentHp > threshold && params.currentHp - params.incomingDamage <= threshold) {
    return {
      nextHp: threshold,
      damageTaken: Math.max(0, params.currentHp - threshold),
      triggered: true,
    };
  }
  const nextHp = Math.max(0, params.currentHp - params.incomingDamage);
  return {
    nextHp,
    damageTaken: Math.max(0, params.currentHp - nextHp),
    triggered: false,
  };
}

export function shouldApplyBossMagicDamper(params: {
  floor: number;
  bossId: string;
  targetId: string;
  bossActive: boolean;
  action: ActionType;
}): boolean {
  return (
    getRoguelikeVoidDominationSourceFloor(params.floor) === 5
    && params.bossActive
    && params.targetId === params.bossId
    && (params.action === "magicWeak" || params.action === "magicStrong")
  );
}

export function applyBossMagicDamper(damage: number): number {
  return Math.max(1, Math.floor(damage * 0.75));
}

export function getPainShareDamage(damage: number): number {
  return Math.floor(damage * 0.2);
}

export function shouldReverseVelocity(floor: number, bossActive: boolean): boolean {
  return getRoguelikeVoidDominationSourceFloor(floor) === 13 && bossActive;
}

export function pickActionOrderBySpeed(params: {
  left: PlayerBattleState;
  right: PlayerBattleState;
  rng: () => number;
  reverse: boolean;
}): [PlayerBattleState, PlayerBattleState] {
  if (params.left.stats.speed === params.right.stats.speed) {
    return params.rng() < 0.5
      ? [params.left, params.right]
      : [params.right, params.left];
  }
  const leftFirst = params.reverse
    ? params.left.stats.speed < params.right.stats.speed
    : params.left.stats.speed > params.right.stats.speed;
  return leftFirst
    ? [params.left, params.right]
    : [params.right, params.left];
}

export function getOverchargeMagicCostRatio(floor: number, bossActive: boolean, actorId: string, bossId: string, action: ActionType): number | null {
  if (getRoguelikeVoidDominationSourceFloor(floor) !== 16 || !bossActive || actorId !== bossId) return null;
  if (action === "magicWeak") return 0.25;
  if (action === "magicStrong") return 0.5;
  return null;
}

export function getOverchargeChargeRecovery(player: PlayerBattleState): {
  hpRecover: number;
  ppRecover: number;
  ppCeiling: number;
} {
  return {
    hpRecover: Math.ceil(player.stats.maxHp * 0.05),
    ppRecover: player.stats.maxPp,
    ppCeiling: player.stats.maxPp * 2,
  };
}

export function shouldSuppressEvasion(floor: number, bossActive: boolean): boolean {
  return getRoguelikeVoidDominationSourceFloor(floor) === 19 && bossActive;
}

export function pickNextVoidminationForm(
  rng: () => number,
  previous?: VoidminationBossForm,
): VoidminationBossForm {
  const candidates = previous
    ? TYPE_CHANGE_FORMS.filter((form) => form !== previous)
    : TYPE_CHANGE_FORMS;
  return candidates[Math.floor(rng() * candidates.length)] ?? "attack";
}

export function applyVoidminationBossForm(baseStats: CharacterStats, form: VoidminationBossForm): CharacterStats {
  if (form === "attack") return { ...baseStats, attack: Math.ceil(baseStats.attack * 1.25) };
  if (form === "magic") {
    const boostedMaxPp = Math.ceil(baseStats.maxPp * 1.2);
    return { ...baseStats, pp: boostedMaxPp, maxPp: boostedMaxPp };
  }
  return { ...baseStats, defense: Math.ceil(baseStats.defense * 1.25) };
}

export function mergeVoidminationBossFormStats(
  currentStats: CharacterStats,
  baseStats: CharacterStats,
  form: VoidminationBossForm,
): CharacterStats {
  const formStats = applyVoidminationBossForm(baseStats, form);
  return {
    ...currentStats,
    attack: formStats.attack,
    defense: formStats.defense,
    pp: formStats.pp,
    maxPp: formStats.maxPp,
  };
}

export function getVoidminationFormLabel(form: VoidminationBossForm): string {
  if (form === "attack") return "こうげき型";
  if (form === "magic") return "まほう型";
  return "バリア型";
}

export function applyColorDrain(player: PlayerBattleState, boss: PlayerBattleState): {
  player: PlayerBattleState;
  boss: PlayerBattleState;
  drainedMaxHp: number;
  drainedMaxPp: number;
} {
  const drainedMaxHp = Math.floor(player.stats.maxHp * 0.15);
  const drainedMaxPp = Math.floor(player.stats.maxPp * 0.15);
  const nextPlayerMaxHp = Math.max(1, player.stats.maxHp - drainedMaxHp);
  const nextPlayerMaxPp = Math.max(1, player.stats.maxPp - drainedMaxPp);
  const nextPlayer = {
    ...player,
    stats: {
      ...player.stats,
      hp: Math.min(player.stats.hp, nextPlayerMaxHp),
      maxHp: nextPlayerMaxHp,
      pp: Math.min(player.stats.pp, nextPlayerMaxPp),
      maxPp: nextPlayerMaxPp,
    },
    currentHp: Math.min(player.currentHp, nextPlayerMaxHp),
    currentPp: Math.min(player.currentPp, nextPlayerMaxPp),
  };
  const nextBoss = {
    ...boss,
    currentHp: Math.min(boss.stats.maxHp, boss.currentHp + drainedMaxHp),
    currentPp: Math.min(boss.stats.maxPp, boss.currentPp + drainedMaxPp),
  };
  return { player: nextPlayer, boss: nextBoss, drainedMaxHp, drainedMaxPp };
}
