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
  applyRoguelikeAutoRecovery,
  ROGUELIKE_SKILL_BALANCE,
  type RoguelikeSkillEffects,
} from "@/lib/roguelikeSkills";
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
  options?: { magicWeak?: number; magicStrong?: number; baseMaxPp?: number },
): number {
  const maxPp = options?.baseMaxPp ?? stats.maxPp;
  if (action === "magicWeak") return Math.max(1, Math.ceil(maxPp * (options?.magicWeak ?? 0.2)));
  if (action === "magicStrong") return Math.max(1, Math.ceil(maxPp * (options?.magicStrong ?? 0.4)));
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

const attackDamage = (attacker: PlayerBattleState, target: PlayerBattleState, defense = target.stats.defense) =>
  applyDefense(attacker.stats.attack * attacker.chargeMultiplier, defense);

const magicDamage = (
  action: ActionType,
  attacker: PlayerBattleState,
  target: PlayerBattleState,
  options?: { magicWeak?: number; magicStrong?: number; baseMaxPp?: number },
  defense = target.stats.defense,
) =>
  applyDefense(magicCost(action, attacker.stats, options) * 5 * attacker.chargeMultiplier, defense);

const barrierCollisionDamage = (attacker: PlayerBattleState, target: PlayerBattleState, defense = target.stats.defense) =>
  applyDefense(attacker.stats.defense * attacker.chargeMultiplier, defense);

const reflectionDamage = (
  magicAction: ActionType,
  magicUser: PlayerBattleState,
  targetDefense: number,
  options?: { magicWeak?: number; magicStrong?: number; baseMaxPp?: number },
) =>
  applyDefense(magicCost(magicAction, magicUser.stats, options) * 5 * magicUser.chargeMultiplier, targetDefense);

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
  weakMagicSelections?: Partial<Record<string, WeakMagicEffectSelection | ((caster: PlayerBattleState) => WeakMagicEffectSelection)>>;
  rng?: () => number;
  /** Use the late-battle 3× multiplier independently of the elapsed turn. */
  forceTripleDamage?: boolean;
  /** When true, voidmination trigger is suppressed (e.g. single-play mode). */
  disableVoidmination?: boolean;
  /**
   * Optional per-character damage caps. When specified, the damage dealt to a
   * character is clamped to the given value before being applied to their HP.
   * Existing callers that do not pass this argument are unaffected.
   */
  damageCaps?: Record<string, number>;
  skillEffects?: Partial<Record<string, RoguelikeSkillEffects>>;
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
  const damageMultiplier = params.forceTripleDamage ? 3 : getDamageMultiplier(params.turn);

  // Capture whether each player charged on the previous turn (before any new
  // charge this turn can overwrite the flag). The 1.5x multiplier expires at
  // the end of this turn regardless of what action is taken.
  const leftHadChargedPrevious = !!left.chargedPreviousTurn;
  const rightHadChargedPrevious = !!right.chargedPreviousTurn;
  const leftWasParalyzed = !!left.paralyzedNextTurn;
  const rightWasParalyzed = !!right.paralyzedNextTurn;
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
  const effectsFor = (player: PlayerBattleState) => params.skillEffects?.[player.id];
  const filterActive = (player: PlayerBattleState) => params.turn === 1 && !!effectsFor(player)?.filter;
  const filterLoggedIds = new Set<string>();
  const logFilterBlock = (player: PlayerBattleState) => {
    if (filterLoggedIds.has(player.id)) return;
    filterLoggedIds.add(player.id);
    logs.push(`[スキル] ${player.nickname} のフィルターがダメージを防いだ！`);
  };
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
  const wasParalyzed = (player: PlayerBattleState) => player.id === left.id ? leftWasParalyzed : rightWasParalyzed;
  const targetDefense = (attacker: PlayerBattleState, target: PlayerBattleState) =>
    effectsFor(target)?.fightSpirit && attacker.characterType === "balanced"
      ? Math.ceil(target.stats.defense * 4 / 5)
      : target.stats.defense;
  const getMagicCostOptions = (actor: PlayerBattleState, action: ActionType) => {
    const overchargeRatio = bossId && voidFloor
      ? getOverchargeMagicCostRatio(voidFloor, bossVoidActive(), actor.id, bossId, action)
      : null;
    const baseMaxPp = voidFloor === 17
      && actor.id === bossId
      && actor.voidminationActive
      && actor.voidminationForm === "magic"
      ? actor.voidminationBaseStats?.maxPp
      : undefined;
    const result: { magicWeak?: number; magicStrong?: number; baseMaxPp?: number } = {};
    if (overchargeRatio !== null) {
      if (action === "magicWeak") result.magicWeak = overchargeRatio;
      if (action === "magicStrong") result.magicStrong = overchargeRatio;
    }
    if (baseMaxPp !== undefined) result.baseMaxPp = baseMaxPp;
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const activateBossVoidmination = () => {
    if (!bossState || !playerState || !voidFloor) return;
    voidminationTriggered = true;
    bossState.voidminationActive = true;
    bossState.voidminationUsed = true;
    if (voidFloor === 19) {
      playerState.voidminationActive = true;
    }
    if (voidFloor === 17) {
      const form = pickNextVoidminationForm(rng, bossState.voidminationForm);
      const baseStats = bossState.voidminationBaseStats ?? structuredClone(bossState.stats);
      bossState.voidminationBaseStats = structuredClone(baseStats);
      bossState.voidminationForm = form;
      bossState.characterType = form;
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
    if (filterActive(to)) {
      logFilterBlock(to);
      return 0;
    }
    const hpBefore = to.currentHp;
    const nextHp = clamp(hpBefore - reflected, 0, to.stats.maxHp);
    const usedGuts = nextHp <= 0 && to.currentHp > 0 && !!effectsFor(to)?.guts && !to.roguelikeGutsUsed;
    to.currentHp = usedGuts ? 1 : nextHp;
    if (usedGuts) {
      to.roguelikeGutsUsed = true;
      logs.push(`[スキル] ${to.nickname} は根性でHP1で耐えた！`);
    }
    damageEvents.push({
      from: from.id,
      to: to.id,
      amount: usedGuts ? Math.max(0, hpBefore - 1) : reflected,
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
    source: "attack" | "magic" | "barrier",
    phaseHint?: "counter",
  ) => {
    const resistance = effectsFor(to)?.[`${source}Resistance`] ?? 0;
    const stacks = Number.isFinite(resistance)
      ? clamp(Math.floor(resistance), 0, ROGUELIKE_SKILL_BALANCE.maxResistanceStacks)
      : 0;
    const tieMultiplier = actionCategory(leftAction) === actionCategory(rightAction) && effectsFor(from)?.tieBoost
      ? ROGUELIKE_SKILL_BALANCE.tieDamageMultiplier
      : 1;
    const resistedAmount = stacks > 0 || tieMultiplier !== 1
      ? Math.max(MIN_DAMAGE, Math.round(amount * tieMultiplier * (1 - stacks * ROGUELIKE_SKILL_BALANCE.resistancePerStack)))
      : amount;
    const scaledAmount = Math.max(MIN_DAMAGE, Math.round(resistedAmount * damageMultiplier));
    const cap = params.damageCaps?.[to.id];
    const fightSpiritBonus = effectsFor(from)?.fightSpirit && to.characterType === "balanced"
      ? Math.ceil(scaledAmount / 5)
      : 0;
    const pursuitBonus = effectsFor(from)?.pursuit && (wasParalyzed(to) || to.chargeMultiplier > 1) ? 50 : 0;
    const modifiedAmount = scaledAmount + fightSpiritBonus + pursuitBonus;
    const cappedAmount = cap !== undefined ? Math.min(modifiedAmount, cap) : modifiedAmount;
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
    const voidActive = shouldSuppressEvasion(voidFloor ?? 0, bossVoidActive());
    const actual = maybeAvoid(finalAmount, to.stats.evasion, rng, voidActive);
    if (actual > 0) {
      if (filterActive(to)) {
        logFilterBlock(to);
        damageEvents.push({ from: from.id, to: to.id, amount: 0, avoided: false, reason, chargeMultiplier: from.chargeMultiplier, phaseHint });
        return 0;
      }
      const bossTakingDamage = !!bossState && to.id === bossState.id && voidFloor;
      const damageResolution = bossTakingDamage
        ? resolveVoidminationDamage({
            currentHp: to.currentHp,
            maxHp: to.stats.maxHp,
            incomingDamage: actual,
            alreadyUsed: !!bossState?.voidminationUsed,
          })
        : { nextHp: clamp(to.currentHp - actual, 0, to.stats.maxHp), damageTaken: actual, triggered: false };
      const usedGuts = damageResolution.nextHp <= 0
        && to.currentHp > 0
        && !!effectsFor(to)?.guts
        && !to.roguelikeGutsUsed;
      const nextHp = usedGuts ? 1 : damageResolution.nextHp;
      const damageTaken = usedGuts ? Math.max(0, to.currentHp - 1) : damageResolution.damageTaken;
      to.currentHp = nextHp;
      if (usedGuts) {
        to.roguelikeGutsUsed = true;
        logs.push(`[スキル] ${to.nickname} は根性でHP1で耐えた！`);
      }
      if (fightSpiritBonus > 0) logs.push(`[スキル] ${from.nickname} の闘争心がダメージを増やした！`);
      if (pursuitBonus > 0) logs.push(`[スキル] ${from.nickname} の追撃！`);
      damageEvents.push({
        from: from.id,
        to: to.id,
        amount: damageTaken,
        avoided: false,
        reason,
        chargeMultiplier: from.chargeMultiplier,
        phaseHint,
      });
      if (damageResolution.triggered) {
        activateBossVoidmination();
      }
      // Floor 10's pain share is explicitly bidirectional: whichever side takes
      // damage reflects 20% of that damage back once the aura is active.
      if (voidFloor === 10 && bossVoidActive()) {
        applyPainShare(to, from, damageTaken);
      }
      return damageTaken;
    } else {
      damageEvents.push({ from: from.id, to: to.id, amount: 0, avoided: true, reason, chargeMultiplier: from.chargeMultiplier, phaseHint });
    }
    return actual;
  };

  // Applies a random 弱まほう special effect to `affected`, caused by `caster`'s weak magic hit.
  const applyWeakMagicEffect = (caster: PlayerBattleState, affected: PlayerBattleState, reflected: boolean) => {
    const selection = params.weakMagicSelections?.[caster.id];
    const effects = getWeakMagicEffects(typeof selection === "function" ? selection(caster) : selection);
    const pick = effects[Math.floor(rng() * effects.length)];
    if (!pick) return;
    if (effectsFor(affected)?.statusResistance && rng() < ROGUELIKE_SKILL_BALANCE.statusResistanceChance) {
      logs.push(`[スキル] ${affected.nickname} は特殊効果を防いだ！`);
      return;
    }
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
    if (!overchargeActive && leftAction === "charge" && rightAction === "charge" && effectsFor(player)?.tieBoost) {
      chargeRecover.hpRecover = Math.ceil(player.stats.maxHp * ROGUELIKE_SKILL_BALANCE.tieChargeRecovery);
      chargeRecover.ppRecover = Math.ceil(player.stats.maxPp * ROGUELIKE_SKILL_BALANCE.tieChargeRecovery);
    }
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
    const cost = magicCost(action, player.stats, getMagicCostOptions(player, action));
    const maxCurrentPp = bossId && player.id === bossId && voidFloor === 16 && bossVoidActive()
      ? player.stats.maxPp * 2
      : player.stats.maxPp;
    const before = player.currentPp;
    player.currentPp = clamp(player.currentPp - cost, 0, maxCurrentPp);
    return Math.min(before, cost);
  };

  const absorbPp = (player: PlayerBattleState, paidPp: number) => {
    if (!effectsFor(player)?.ppAbsorb) return;
    const recovered = Math.min(
      Math.max(0, player.stats.maxPp - player.currentPp),
      Math.ceil(paidPp * ROGUELIKE_SKILL_BALANCE.ppAbsorbRatio),
    );
    if (recovered <= 0) return;
    player.currentPp += recovered;
    logs.push(`[スキル] ${player.nickname} はPPを${recovered}吸収した！`);
  };
  const weakMagicHit = (dealt: number, affected: PlayerBattleState) =>
    dealt > 0 || (filterActive(affected) && damageEvents.at(-1)?.avoided === false);

  const leftCategory = actionCategory(leftAction);
  const rightCategory = actionCategory(rightAction);
  const bossAction = bossState
    ? bossState.id === left.id
      ? leftAction
      : rightAction
    : null;

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
    if (action === "attack") applyDamage(actor, target, attackDamage(actor, target, targetDefense(actor, target)), "こうげき", "attack");
    if (action === "magicWeak" || action === "magicStrong") {
      consumePp(actor, action);
      const dealt = applyDamage(
        actor,
        target,
        magicDamage(action, actor, target, getMagicCostOptions(actor, action), targetDefense(actor, target)),
        action === "magicWeak" ? "弱まほう" : "強まほう",
        "magic",
      );
      if (action === "magicWeak" && weakMagicHit(dealt, target)) applyWeakMagicEffect(actor, target, false);
    }
    if (action === "barrier" && targetAction === "barrier") {
      applyDamage(actor, target, barrierCollisionDamage(actor, target, targetDefense(actor, target)), "こうげき", "barrier");
    }
  };

  if (leftActionSuppressed && rightActionSuppressed) {
    // no-op
  } else if (leftActionSuppressed) {
    processStrike(right, rightAction, left, leftAction);
  } else if (rightActionSuppressed) {
    processStrike(left, leftAction, right, rightAction);
  } else if (leftCategory === "magic" && rightCategory === "barrier") {
    const paidPp = consumePp(left, leftAction);
    const dealt = applyDamage(
      right,
      left,
      reflectionDamage(leftAction, left, targetDefense(right, left), getMagicCostOptions(left, leftAction)),
      "バリア反射",
      "barrier",
    );
    absorbPp(right, paidPp);
    // The magic caster (left) takes the reflected damage, so a 弱まほう effect
    // applies to themself instead of the barrier user.
    if (leftAction === "magicWeak" && weakMagicHit(dealt, left)) applyWeakMagicEffect(left, left, true);
  } else if (rightCategory === "magic" && leftCategory === "barrier") {
    const paidPp = consumePp(right, rightAction);
    const dealt = applyDamage(
      left,
      right,
      reflectionDamage(rightAction, right, targetDefense(left, right), getMagicCostOptions(right, rightAction)),
      "バリア反射",
      "barrier",
    );
    absorbPp(left, paidPp);
    if (rightAction === "magicWeak" && weakMagicHit(dealt, right)) applyWeakMagicEffect(right, right, true);
  } else if (leftCategory === "barrier" && rightCategory === "charge") {
    applyDamage(left, right, barrierCollisionDamage(left, right, targetDefense(left, right)), "こうげき", "barrier", "counter");
  } else if (rightCategory === "barrier" && leftCategory === "charge") {
    applyDamage(right, left, barrierCollisionDamage(right, left, targetDefense(right, left)), "こうげき", "barrier", "counter");
  } else if (leftCategory === "barrier" && rightCategory === "paralysis") {
    applyDamage(left, right, barrierCollisionDamage(left, right, targetDefense(left, right)), "こうげき", "barrier", "counter");
  } else if (rightCategory === "barrier" && leftCategory === "paralysis") {
    applyDamage(right, left, barrierCollisionDamage(right, left, targetDefense(right, left)), "こうげき", "barrier", "counter");
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

  const bossTookTurnThisRound = !!bossState
    && bossAction !== null
    && bossAction !== "paralysis"
    && !suppressedByTieBanIds.includes(bossState.id);
  if (
    bossState
    && voidFloor === 17
    && bossState.voidminationActive
    && bossState.currentHp > 0
    && !voidminationTriggered
    && bossTookTurnThisRound
  ) {
    const remaining = (bossState.voidminationFormTurnsRemaining ?? 3) - 1;
    if (remaining <= 0) {
      const nextForm = pickNextVoidminationForm(rng, bossState.voidminationForm);
      const baseStats = bossState.voidminationBaseStats ?? structuredClone(bossState.stats);
      const nextStats = mergeVoidminationBossFormStats(bossState.stats, baseStats, nextForm);
      bossState.voidminationBaseStats = structuredClone(baseStats);
      bossState.voidminationForm = nextForm;
      bossState.characterType = nextForm;
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

  for (const player of [left, right]) {
    const effects = effectsFor(player);
    if (!effects) continue;
    const recovered = applyRoguelikeAutoRecovery(player, effects);
    const hpRecover = recovered.currentHp - player.currentHp;
    const ppRecover = recovered.currentPp - player.currentPp;
    Object.assign(player, recovered);
    if (hpRecover > 0 || ppRecover > 0) {
      logs.push(`[スキル] ${player.nickname} はHPを${hpRecover}、PPを${ppRecover}自動回復した！`);
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
