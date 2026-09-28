import type {
  ActionCategory,
  ActionType,
  CharacterStats,
  PlayerBattleState,
  TurnChargeEvent,
  TurnDamageEvent,
  TurnMagicEffectEvent,
  TurnResult,
  WeakMagicEffectKind,
  WeakMagicEffectSelection,
} from "@/types/game";
import { checkVoidminationTrigger } from "@/lib/voidmination";
import {
  applyBossMagicDamper,
  applyColorDrain,
  getOverchargeChargeRecovery,
  getOverchargeMagicCostRatio,
  getPainShareDamage,
  getRoguelikeVoidDominationSourceFloor,
  getVoidminationFormLabel,
  mergeVoidminationBossFormStats,
  pickActionOrderBySpeed,
  pickNextVoidminationForm,
  resolveVoidminationDamage,
  shouldApplyBossMagicDamper,
  shouldReverseVelocity,
  shouldSuppressEvasion,
} from "@/lib/roguelikeVoidDomination";

const MIN_DAMAGE = 1;
export const DEFENSE_SCALE = 300;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** 防御による逓減軽減: raw × DEFENSE_SCALE / (DEFENSE_SCALE + defense) */
export const applyDefense = (raw: number, defense: number) =>
  Math.max(MIN_DAMAGE, Math.round(raw * DEFENSE_SCALE / (DEFENSE_SCALE + Math.max(0, defense))));

export function actionCategory(action: ActionType): ActionCategory {
  if (action === "magicWeak" || action === "magicStrong") return "magic";
  return action;
}

export function magicCost(
  action: ActionType,
  stats: CharacterStats,
  ratios?: { magicWeak?: number; magicStrong?: number },
): number {
  if (action === "magicWeak") return Math.max(1, Math.ceil(stats.maxPp * (ratios?.magicWeak ?? 0.2)));
  if (action === "magicStrong") return Math.max(1, Math.ceil(stats.maxPp * (ratios?.magicStrong ?? 0.4)));
  return 0;
}

export interface WeakMagicEffectDefinition {
  kind: WeakMagicEffectKind;
  name: string;
  turns: number;
}

export const ONE_TURN_WEAK_MAGIC_EFFECTS: WeakMagicEffectDefinition[] = [
  { kind: "paralysis", name: "まひ", turns: 1 },
  { kind: "tieBan", name: "あいこ禁止", turns: 1 },
];

export const TWO_TURN_WEAK_MAGIC_EFFECTS: WeakMagicEffectDefinition[] = [
  { kind: "attackBan", name: "こうげき禁止", turns: 2 },
  { kind: "barrierBan", name: "バリア禁止", turns: 2 },
  { kind: "magicBan", name: "まほう禁止", turns: 2 },
  { kind: "chargeBan", name: "チャージ禁止", turns: 2 },
];

export const ALL_WEAK_MAGIC_EFFECTS: WeakMagicEffectDefinition[] = [...ONE_TURN_WEAK_MAGIC_EFFECTS, ...TWO_TURN_WEAK_MAGIC_EFFECTS];

/** 弱まほうがヒットした際にランダムで付与される既定の特殊効果一覧（後方互換用）。 */
export const WEAK_MAGIC_EFFECTS: WeakMagicEffectDefinition[] = [
  TWO_TURN_WEAK_MAGIC_EFFECTS.find((effect) => effect.kind === "barrierBan")!,
  TWO_TURN_WEAK_MAGIC_EFFECTS.find((effect) => effect.kind === "chargeBan")!,
  ONE_TURN_WEAK_MAGIC_EFFECTS.find((effect) => effect.kind === "paralysis")!,
];

const DEFAULT_WEAK_MAGIC_EFFECT_KINDS: WeakMagicEffectKind[] = ["barrierBan", "chargeBan", "paralysis"];

const WEAK_MAGIC_EFFECT_MAP = new Map(ALL_WEAK_MAGIC_EFFECTS.map((effect) => [effect.kind, effect] as const));

const getWeakMagicEffects = (selection?: WeakMagicEffectSelection): WeakMagicEffectDefinition[] => {
  const kinds = selection?.kinds
    ? selection.kinds
    : selection?.oneTurn && selection?.twoTurn
    ? [selection.oneTurn, ...selection.twoTurn]
    : DEFAULT_WEAK_MAGIC_EFFECT_KINDS;
  return kinds
    .map((kind) => WEAK_MAGIC_EFFECT_MAP.get(kind))
    .filter((effect): effect is WeakMagicEffectDefinition => !!effect);
};

export function getAvailableActions(player: PlayerBattleState, turn: number): ActionType[] {
  if (player.forceMagicStrongAction) return ["magicStrong"];
  if (player.paralyzedNextTurn) return [];
  const disallowed = player.lastActionCategory;
  return (["attack", "magicWeak", "magicStrong", "barrier", "charge"] as ActionType[]).filter((action) => {
    if (disallowed && actionCategory(action) === disallowed) return false;
    if (action === "attack" && (player.attackBanTurns ?? 0) > 0) return false;
    if (action === "barrier" && (player.barrierBanTurns ?? 0) > 0) return false;
    if (action === "charge" && (player.chargeBanTurns ?? 0) > 0) return false;
    if ((action === "magicWeak" || action === "magicStrong") && (player.magicBanTurns ?? 0) > 0) return false;
    if (action === "charge" && turn === 1) return false;
    const cost = magicCost(action, player.stats);
    return player.currentPp >= cost;
  });
}

const matchupWinner = (left: ActionCategory, right: ActionCategory): ActionCategory | null => {
  if (left === right) return null;
  if (left === "attack" && right === "barrier") return "attack";
  if (left === "barrier" && right === "magic") return "barrier";
  if (left === "magic" && right === "attack") return "magic";
  if (right === "attack" && left === "barrier") return "attack";
  if (right === "barrier" && left === "magic") return "barrier";
  if (right === "magic" && left === "attack") return "magic";
  return null;
};

const attackDamage = (attacker: PlayerBattleState, target: PlayerBattleState) =>
  applyDefense(attacker.stats.attack * attacker.chargeMultiplier, target.stats.defense);

const magicDamage = (
  action: ActionType,
  attacker: PlayerBattleState,
  target: PlayerBattleState,
  ratios?: { magicWeak?: number; magicStrong?: number },
) =>
  applyDefense(magicCost(action, attacker.stats, ratios) * 5 * attacker.chargeMultiplier, target.stats.defense);

const barrierCollisionDamage = (attacker: PlayerBattleState, target: PlayerBattleState) =>
  applyDefense(attacker.stats.defense * attacker.chargeMultiplier, target.stats.defense);

const reflectionDamage = (
  magicAction: ActionType,
  magicUser: PlayerBattleState,
  targetDefense: number,
  ratios?: { magicWeak?: number; magicStrong?: number },
) =>
  applyDefense(magicCost(magicAction, magicUser.stats, ratios) * 5 * magicUser.chargeMultiplier, targetDefense);

// 相手がチャージ/まひ状態で自身がバリアを選んだ際に発生する追加ダメージ。
// 計算式: [自身の防御値 × チャージ倍率] に防御軽減 [raw × 300 / (300 + 相手の防御値)] を適用

const maybeAvoid = (damage: number, evasion: number, rng: () => number, voidminationActive?: boolean) =>
  voidminationActive || rng() >= evasion ? damage : 0;

export function getDamageMultiplier(turn: number): number {
  if (turn > 20) return 3;
  if (turn > 15) return 2;
  return 1;
}

export function resolveTurn(params: {
  turn: number;
  players: Record<string, PlayerBattleState>;
  actions: Record<string, ActionType>;
  weakMagicSelections?: Partial<Record<string, WeakMagicEffectSelection>>;
  rng?: () => number;
  /** When true, voidmination trigger is suppressed (e.g. single-play mode). */
  disableVoidmination?: boolean;
  /**
   * Optional per-character damage caps. When specified, the damage dealt to a
   * character is clamped to the given value before being applied to their HP.
   * Existing callers that do not pass this argument are unaffected.
   */
  damageCaps?: Record<string, number>;
  roguelikeBossBattle?: {
    floor: number;
    bossId: string;
    playerId: string;
  };
}): TurnResult {
  const rng = params.rng ?? Math.random;
  const ids = Object.keys(params.players);
  const [leftId, rightId] = ids;
  const left = structuredClone(params.players[leftId]);
  const right = structuredClone(params.players[rightId]);
  const leftAction = left.forceMagicStrongAction ? ("magicStrong" as ActionType) : params.actions[leftId];
  const rightAction = right.forceMagicStrongAction ? ("magicStrong" as ActionType) : params.actions[rightId];
  const damageMultiplier = getDamageMultiplier(params.turn);

  // Capture whether each player charged on the previous turn (before any new
  // charge this turn can overwrite the flag). The 1.5x multiplier expires at
  // the end of this turn regardless of what action is taken.
  const leftHadChargedPrevious = !!left.chargedPreviousTurn;
  const rightHadChargedPrevious = !!right.chargedPreviousTurn;
  const leftTieBanActive = !!left.tieBanActive;
  const rightTieBanActive = !!right.tieBanActive;
  left.chargedPreviousTurn = false;
  right.chargedPreviousTurn = false;

  const logs: string[] = [];
  const damageEvents: TurnDamageEvent[] = [];
  const chargeEvents: TurnChargeEvent[] = [];
  const magicEffectEvents: TurnMagicEffectEvent[] = [];
  const suppressedByTieBanIds: string[] = [];
  let voidminationTriggered = false;
  const voidFloor = params.roguelikeBossBattle
    ? getRoguelikeVoidDominationSourceFloor(params.roguelikeBossBattle.floor)
    : null;
  const bossId = params.roguelikeBossBattle?.bossId;
  const playerId = params.roguelikeBossBattle?.playerId;
  let voidminationStatusText: string | null = null;

  const bossState = bossId
    ? left.id === bossId
      ? left
      : right.id === bossId
      ? right
      : null
    : null;
  const playerState = playerId
    ? left.id === playerId
      ? left
      : right.id === playerId
      ? right
      : null
    : null;

  const bossVoidActive = () => !!bossState?.voidminationActive;
  const getMagicCostRatios = (actor: PlayerBattleState, action: ActionType) => {
    const overchargeRatio = bossId && voidFloor
      ? getOverchargeMagicCostRatio(voidFloor, bossVoidActive(), actor.id, bossId, action)
      : null;
    if (overchargeRatio === null) return undefined;
    return action === "magicWeak"
      ? { magicWeak: overchargeRatio }
      : { magicStrong: overchargeRatio };
  };

  const activateBossVoidmination = () => {
    if (!bossState || !playerState || !voidFloor) return;
    voidminationTriggered = true;
    bossState.voidminationActive = true;
    bossState.voidminationUsed = true;
    if (voidFloor === 17) {
      const form = pickNextVoidminationForm(rng, bossState.voidminationForm);
      const baseStats = bossState.voidminationBaseStats ?? structuredClone(bossState.stats);
      bossState.voidminationBaseStats = structuredClone(baseStats);
      bossState.voidminationForm = form;
      bossState.voidminationFormTurnsRemaining = 3;
      const nextStats = mergeVoidminationBossFormStats(bossState.stats, baseStats, form);
      bossState.stats = nextStats;
      bossState.currentPp = Math.min(bossState.currentPp, nextStats.maxPp);
      const label = getVoidminationFormLabel(form);
      logs.push(`${bossState.nickname} は${label}に変化した！`);
      voidminationStatusText = `${bossState.nickname} は${label}に変化した！`;
    }
    if (voidFloor === 18) {
      const drained = applyColorDrain(playerState, bossState);
      const updatedPlayer = playerState.id === drained.player.id ? drained.player : playerState;
      const updatedBoss = bossState.id === drained.boss.id ? drained.boss : bossState;
      if (left.id === updatedPlayer.id) {
        Object.assign(left, updatedPlayer);
        Object.assign(right, updatedBoss);
      } else {
        Object.assign(right, updatedPlayer);
        Object.assign(left, updatedBoss);
      }
      logs.push(`${bossState.nickname} がカラードレインを発動した！`);
      voidminationStatusText = `${bossState.nickname} がカラードレインを発動した！`;
    }
  };

  // Consume this turn's ban/paralysis counters that were carried over from a
  // previous turn's 弱まほう effect, before any new effects are applied below.
  for (const player of [left, right]) {
    if ((player.attackBanTurns ?? 0) > 0) player.attackBanTurns = (player.attackBanTurns ?? 0) - 1;
    if ((player.barrierBanTurns ?? 0) > 0) player.barrierBanTurns = (player.barrierBanTurns ?? 0) - 1;
    if ((player.magicBanTurns ?? 0) > 0) player.magicBanTurns = (player.magicBanTurns ?? 0) - 1;
    if ((player.chargeBanTurns ?? 0) > 0) player.chargeBanTurns = (player.chargeBanTurns ?? 0) - 1;
    player.paralyzedNextTurn = false;
    player.tieBanActive = false;
  }

  const applyPainShare = (from: PlayerBattleState, to: PlayerBattleState, amount: number) => {
    const reflected = getPainShareDamage(amount);
    if (reflected <= 0) return 0;
    to.currentHp = clamp(to.currentHp - reflected, 0, to.stats.maxHp);
    damageEvents.push({
      from: from.id,
      to: to.id,
      amount: reflected,
      avoided: false,
      reason: "ペインシェア",
      chargeMultiplier: 1,
    });
    return reflected;
  };

  const applyDamage = (
    from: PlayerBattleState,
    to: PlayerBattleState,
    amount: number,
    reason: string,
    phaseHint?: "counter",
  ) => {
    const scaledAmount = Math.max(MIN_DAMAGE, Math.round(amount * damageMultiplier));
    const cap = params.damageCaps?.[to.id];
    const cappedAmount = cap !== undefined ? Math.min(scaledAmount, cap) : scaledAmount;
    const magicDamperActive = bossId && voidFloor
      ? shouldApplyBossMagicDamper({
          floor: voidFloor,
          bossId,
          targetId: to.id,
          bossActive: bossVoidActive(),
          action: from.id === left.id ? leftAction : rightAction,
        })
      : false;
    const finalAmount = magicDamperActive ? applyBossMagicDamper(cappedAmount) : cappedAmount;
    const voidActive = shouldSuppressEvasion(voidFloor ?? 0, bossVoidActive()) || !!(left.voidminationActive || right.voidminationActive);
    const actual = maybeAvoid(finalAmount, to.stats.evasion, rng, voidActive);
    if (actual > 0) {
      const bossTakingDamage = !!bossState && to.id === bossState.id && voidFloor;
      const wasBossActive = bossVoidActive();
      const damageResolution = bossTakingDamage
        ? resolveVoidminationDamage({
            currentHp: to.currentHp,
            maxHp: to.stats.maxHp,
            incomingDamage: actual,
            alreadyUsed: !!bossState?.voidminationUsed,
          })
        : { nextHp: clamp(to.currentHp - actual, 0, to.stats.maxHp), damageTaken: actual, triggered: false };
      to.currentHp = damageResolution.nextHp;
      damageEvents.push({
        from: from.id,
        to: to.id,
        amount: damageResolution.damageTaken,
        avoided: false,
        reason,
        chargeMultiplier: from.chargeMultiplier,
        phaseHint,
      });
      if (damageResolution.triggered) {
        activateBossVoidmination();
      }
      if (voidFloor === 10 && bossVoidActive() && !wasBossActive && damageResolution.triggered) return damageResolution.damageTaken;
      if (voidFloor === 10 && bossVoidActive()) {
        applyPainShare(to, from, damageResolution.damageTaken);
      }
      return damageResolution.damageTaken;
    } else {
      damageEvents.push({ from: from.id, to: to.id, amount: 0, avoided: true, reason, chargeMultiplier: from.chargeMultiplier, phaseHint });
    }
    return actual;
  };

  // Applies a random 弱まほう special effect to `affected`, caused by `caster`'s weak magic hit.
  const applyWeakMagicEffect = (caster: PlayerBattleState, affected: PlayerBattleState, reflected: boolean) => {
    const effects = getWeakMagicEffects(params.weakMagicSelections?.[caster.id]);
    const pick = effects[Math.floor(rng() * effects.length)];
    if (!pick) return;
    if (pick.kind === "attackBan") affected.attackBanTurns = pick.turns;
    if (pick.kind === "barrierBan") affected.barrierBanTurns = pick.turns;
    if (pick.kind === "magicBan") affected.magicBanTurns = pick.turns;
    if (pick.kind === "chargeBan") affected.chargeBanTurns = pick.turns;
    if (pick.kind === "paralysis") affected.paralyzedNextTurn = true;
    if (pick.kind === "tieBan") affected.tieBanActive = true;
    magicEffectEvents.push({ casterId: caster.id, affectedId: affected.id, effectName: pick.name, reflected });
    logs.push(`${affected.nickname} に「${pick.name}」が発動！`);
  };

  const recoverFromCharge = (player: PlayerBattleState) => {
    const overchargeActive = !!bossState
      && !!voidFloor
      && voidFloor === 16
      && bossVoidActive()
      && player.id === bossState.id;
    const chargeRecover = overchargeActive
      ? getOverchargeChargeRecovery(player)
      : {
          hpRecover: Math.ceil(player.stats.maxHp * 0.25),
          ppRecover: Math.ceil(player.stats.maxPp * 0.25),
          ppCeiling: player.stats.maxPp,
        };
    const hpRecover = chargeRecover.hpRecover;
    const ppRecover = chargeRecover.ppRecover;
    player.currentHp = clamp(player.currentHp + hpRecover, 0, player.stats.maxHp);
    player.currentPp = clamp(player.currentPp + ppRecover, 0, chargeRecover.ppCeiling);
    player.chargeMultiplier = 1.5;
    if (player.halveDefenseOnCharge) {
      player.stats.defense = Math.max(1, Math.round(player.stats.defense / 2));
      logs.push(`${player.nickname} の防御力が下がった！`);
    }
    player.chargedPreviousTurn = true;
    player.lastChargeHpRecover = hpRecover;
    player.lastChargePpRecover = ppRecover;
  };

  const consumePp = (player: PlayerBattleState, action: ActionType) => {
    const cost = magicCost(action, player.stats, getMagicCostRatios(player, action));
    const maxCurrentPp = bossId && player.id === bossId && voidFloor === 16 && bossVoidActive()
      ? player.stats.maxPp * 2
      : player.stats.maxPp;
    player.currentPp = clamp(player.currentPp - cost, 0, maxCurrentPp);
  };

  const leftCategory = actionCategory(leftAction);
  const rightCategory = actionCategory(rightAction);

  const sameCategory = leftCategory === rightCategory;
  const leftActionSuppressed = sameCategory && leftTieBanActive;
  const rightActionSuppressed = sameCategory && rightTieBanActive;

  if (leftActionSuppressed) {
    suppressedByTieBanIds.push(left.id);
    logs.push(`${left.nickname} は「あいこ禁止」の効果で行動できなかった！`);
  }
  if (rightActionSuppressed) {
    suppressedByTieBanIds.push(right.id);
    logs.push(`${right.nickname} は「あいこ禁止」の効果で行動できなかった！`);
  }

  if (leftAction === "charge" && !leftActionSuppressed) {
    recoverFromCharge(left);
    chargeEvents.push({ playerId: left.id, hpRecover: left.lastChargeHpRecover ?? 0, ppRecover: left.lastChargePpRecover ?? 0 });
    logs.push(`${left.nickname} がチャージ！`);
  }
  if (rightAction === "charge" && !rightActionSuppressed) {
    recoverFromCharge(right);
    chargeEvents.push({ playerId: right.id, hpRecover: right.lastChargeHpRecover ?? 0, ppRecover: right.lastChargePpRecover ?? 0 });
    logs.push(`${right.nickname} がチャージ！`);
  }

  const [speedFirst, speedSecond] = pickActionOrderBySpeed({
    left,
    right,
    rng,
    reverse: shouldReverseVelocity(voidFloor ?? 0, bossVoidActive()),
  });
  const winner = matchupWinner(leftCategory, rightCategory);

  const canHit = (action: ActionType, opponentAction?: ActionType): boolean => {
    if (!opponentAction) return true;
    const playerCategory = actionCategory(action);
    const oppCategory = actionCategory(opponentAction);
    const outcome = matchupWinner(playerCategory, oppCategory);
    return outcome === null || outcome === playerCategory;
  };

  const processStrike = (actor: PlayerBattleState, action: ActionType, target: PlayerBattleState, targetAction?: ActionType) => {
    if (actor.currentHp <= 0) return;
    if (!canHit(action, targetAction)) return;
    if (action === "attack") applyDamage(actor, target, attackDamage(actor, target), "こうげき");
    if (action === "magicWeak" || action === "magicStrong") {
      consumePp(actor, action);
      const dealt = applyDamage(
        actor,
        target,
        magicDamage(action, actor, target, getMagicCostRatios(actor, action)),
        action === "magicWeak" ? "弱まほう" : "強まほう",
      );
      if (action === "magicWeak" && dealt > 0) applyWeakMagicEffect(actor, target, false);
    }
    if (action === "barrier" && targetAction === "barrier") {
      applyDamage(actor, target, barrierCollisionDamage(actor, target), "こうげき");
    }
  };

  if (leftActionSuppressed && rightActionSuppressed) {
    // no-op
  } else if (leftActionSuppressed) {
    processStrike(right, rightAction, left, undefined);
  } else if (rightActionSuppressed) {
    processStrike(left, leftAction, right, undefined);
  } else if (leftCategory === "magic" && rightCategory === "barrier") {
    consumePp(left, leftAction);
    const dealt = applyDamage(
      right,
      left,
      reflectionDamage(leftAction, left, left.stats.defense, getMagicCostRatios(left, leftAction)),
      "バリア反射",
    );
    // The magic caster (left) takes the reflected damage, so a 弱まほう effect
    // applies to themself instead of the barrier user.
    if (leftAction === "magicWeak" && dealt > 0) applyWeakMagicEffect(left, left, true);
  } else if (rightCategory === "magic" && leftCategory === "barrier") {
    consumePp(right, rightAction);
    const dealt = applyDamage(
      left,
      right,
      reflectionDamage(rightAction, right, right.stats.defense, getMagicCostRatios(right, rightAction)),
      "バリア反射",
    );
    if (rightAction === "magicWeak" && dealt > 0) applyWeakMagicEffect(right, right, true);
  } else if (leftCategory === "barrier" && rightCategory === "charge") {
    applyDamage(left, right, barrierCollisionDamage(left, right), "こうげき", "counter");
  } else if (rightCategory === "barrier" && leftCategory === "charge") {
    applyDamage(right, left, barrierCollisionDamage(right, left), "こうげき", "counter");
  } else if (leftCategory === "barrier" && rightCategory === "paralysis") {
    applyDamage(left, right, barrierCollisionDamage(left, right), "こうげき", "counter");
  } else if (rightCategory === "barrier" && leftCategory === "paralysis") {
    applyDamage(right, left, barrierCollisionDamage(right, left), "こうげき", "counter");
  } else if (winner === null) {
    processStrike(speedFirst, speedFirst.id === left.id ? leftAction : rightAction, speedSecond, speedSecond.id === left.id ? leftAction : rightAction);
    processStrike(speedSecond, speedSecond.id === left.id ? leftAction : rightAction, speedFirst, speedFirst.id === left.id ? leftAction : rightAction);
  } else {
    processStrike(left, leftAction, right, rightAction);
    processStrike(right, rightAction, left, leftAction);
  }

  left.lastActionCategory = leftCategory;
  right.lastActionCategory = rightCategory;

  // Turn-based chargeMultiplier reset: if a player used チャージ last turn, the
  // 1.5x boost was active for this turn only. Reset it now regardless of what
  // action was taken this turn (including paralysis / no action).
  if (leftHadChargedPrevious) left.chargeMultiplier = 1;
  if (rightHadChargedPrevious) right.chargeMultiplier = 1;

  if (bossState && voidFloor === 17 && bossState.voidminationActive && bossState.currentHp > 0 && !voidminationTriggered) {
    const remaining = (bossState.voidminationFormTurnsRemaining ?? 3) - 1;
    if (remaining <= 0) {
      const nextForm = pickNextVoidminationForm(rng, bossState.voidminationForm);
      const baseStats = bossState.voidminationBaseStats ?? structuredClone(bossState.stats);
      const nextStats = mergeVoidminationBossFormStats(bossState.stats, baseStats, nextForm);
      bossState.voidminationBaseStats = structuredClone(baseStats);
      bossState.voidminationForm = nextForm;
      bossState.voidminationFormTurnsRemaining = 3;
      bossState.stats = nextStats;
      bossState.currentPp = Math.min(bossState.currentPp, nextStats.maxPp);
      const label = getVoidminationFormLabel(nextForm);
      logs.push(`${bossState.nickname} は${label}に変化した！`);
      voidminationStatusText = `${bossState.nickname} は${label}に変化した！`;
    } else {
      bossState.voidminationFormTurnsRemaining = remaining;
    }
  }

  // Check and apply 空間支配（ヴォイドミネーション）trigger (multiplayer only).
  const alreadyActive = !!(left.voidminationActive || right.voidminationActive);
  if (!params.disableVoidmination && !alreadyActive) {
    const turnHadAvoidance = damageEvents.some((e) => e.avoided);
    const trigger = checkVoidminationTrigger({ players: [left, right], turnHadAvoidance });
    if (trigger) {
      voidminationTriggered = true;
      left.voidminationActive = true;
      right.voidminationActive = true;
    }
  }

  const winnerId = left.currentHp <= 0 && right.currentHp <= 0 ? null : left.currentHp <= 0 ? right.id : right.currentHp <= 0 ? left.id : null;

  return {
    turn: params.turn,
    actions: params.actions,
    logs,
    damageEvents,
    chargeEvents,
    magicEffectEvents,
    suppressedByTieBanIds,
    winnerId,
    actionOrder: [speedFirst.id, speedSecond.id],
    voidminationTriggered,
    voidminationStatusText,
    nextStates: {
      [left.id]: left,
      [right.id]: right,
    },
  };
}
