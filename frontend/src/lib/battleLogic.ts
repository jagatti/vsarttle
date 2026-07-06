import type { ActionCategory, ActionType, CharacterStats, PlayerBattleState, TurnDamageEvent, TurnResult } from "@/types/game";

const MIN_DAMAGE = 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function actionCategory(action: ActionType): ActionCategory {
  if (action === "magicWeak" || action === "magicStrong") return "magic";
  return action;
}

export function magicCost(action: ActionType, stats: CharacterStats): number {
  if (action === "magicWeak") return Math.max(1, Math.ceil(stats.maxPp * 0.2));
  if (action === "magicStrong") return Math.max(1, Math.ceil(stats.maxPp * 0.4));
  return 0;
}

export function getAvailableActions(player: PlayerBattleState): ActionType[] {
  const disallowed = player.lastActionCategory;
  return (["attack", "magicWeak", "magicStrong", "barrier", "charge"] as ActionType[]).filter((action) => {
    if (disallowed && actionCategory(action) === disallowed) return false;
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
  Math.max(MIN_DAMAGE, Math.round(attacker.stats.attack * attacker.chargeMultiplier - target.stats.defense / 2));

const magicDamage = (action: ActionType, attacker: PlayerBattleState, target: PlayerBattleState) =>
  Math.max(MIN_DAMAGE, Math.round(magicCost(action, attacker.stats) * 5 * attacker.chargeMultiplier - target.stats.defense / 2));

const barrierCollisionDamage = (attacker: PlayerBattleState, target: PlayerBattleState) =>
  Math.max(MIN_DAMAGE, Math.round(attacker.stats.defense * attacker.chargeMultiplier - target.stats.defense / 2));

const reflectionDamage = (magicAction: ActionType, magicUser: PlayerBattleState, targetDefense: number) =>
  Math.max(MIN_DAMAGE, Math.round(magicCost(magicAction, magicUser.stats) * 5 * magicUser.chargeMultiplier - targetDefense / 2));

const maybeAvoid = (damage: number, evasion: number, rng: () => number) => (rng() < evasion ? 0 : damage);

export function resolveTurn(params: {
  turn: number;
  players: Record<string, PlayerBattleState>;
  actions: Record<string, ActionType>;
  rng?: () => number;
}): TurnResult {
  const rng = params.rng ?? Math.random;
  const ids = Object.keys(params.players);
  const [leftId, rightId] = ids;
  const left = structuredClone(params.players[leftId]);
  const right = structuredClone(params.players[rightId]);
  const leftAction = params.actions[leftId];
  const rightAction = params.actions[rightId];

  const logs: string[] = [];
  const damageEvents: TurnDamageEvent[] = [];

  const applyDamage = (from: PlayerBattleState, to: PlayerBattleState, amount: number, reason: string) => {
    const actual = maybeAvoid(amount, to.stats.evasion, rng);
    if (actual > 0) {
      to.currentHp = clamp(to.currentHp - actual, 0, to.stats.maxHp);
      damageEvents.push({ from: from.id, to: to.id, amount: actual, avoided: false, reason });
    } else {
      damageEvents.push({ from: from.id, to: to.id, amount: 0, avoided: true, reason });
    }
  };

  const recoverFromCharge = (player: PlayerBattleState) => {
    player.currentHp = clamp(player.currentHp + Math.ceil(player.stats.maxHp * 0.33), 0, player.stats.maxHp);
    player.currentPp = clamp(player.currentPp + Math.ceil(player.stats.maxPp * 0.33), 0, player.stats.maxPp);
    player.chargeMultiplier = 1.5;
  };

  const consumePp = (player: PlayerBattleState, action: ActionType) => {
    const cost = magicCost(action, player.stats);
    player.currentPp = clamp(player.currentPp - cost, 0, player.stats.maxPp);
  };

  const leftCategory = actionCategory(leftAction);
  const rightCategory = actionCategory(rightAction);

  if (leftAction === "charge") {
    recoverFromCharge(left);
    logs.push(`${left.nickname} がチャージ！`);
  }
  if (rightAction === "charge") {
    recoverFromCharge(right);
    logs.push(`${right.nickname} がチャージ！`);
  }

  const speedFirst = left.stats.speed === right.stats.speed ? (rng() < 0.5 ? left : right) : left.stats.speed > right.stats.speed ? left : right;
  const speedSecond = speedFirst.id === left.id ? right : left;
  const winner = matchupWinner(leftCategory, rightCategory);

  const canHit = (player: PlayerBattleState, action: ActionType, opponentAction: ActionType): boolean => {
    const playerCategory = actionCategory(action);
    const oppCategory = actionCategory(opponentAction);
    const outcome = matchupWinner(playerCategory, oppCategory);
    return outcome === null || outcome === playerCategory;
  };

  const processStrike = (actor: PlayerBattleState, action: ActionType, target: PlayerBattleState, targetAction: ActionType) => {
    if (actor.currentHp <= 0) return;
    if (!canHit(actor, action, targetAction)) return;
    if (action === "attack") applyDamage(actor, target, attackDamage(actor, target), "こうげき");
    if (action === "magicWeak" || action === "magicStrong") {
      consumePp(actor, action);
      applyDamage(actor, target, magicDamage(action, actor, target), action === "magicWeak" ? "弱まほう" : "強まほう");
    }
    if (action === "barrier" && targetAction === "barrier") {
      applyDamage(actor, target, barrierCollisionDamage(actor, target), "バリア衝突");
    }
    if (actor.chargeMultiplier > 1 && ["attack", "magicWeak", "magicStrong", "barrier"].includes(action)) {
      actor.chargeMultiplier = 1;
    }
  };

  if (leftCategory === "magic" && rightCategory === "barrier") {
    consumePp(left, leftAction);
    applyDamage(right, left, reflectionDamage(leftAction, left, left.stats.defense), "バリア反射");
    if (right.chargeMultiplier > 1) right.chargeMultiplier = 1;
    if (left.chargeMultiplier > 1) left.chargeMultiplier = 1;
  } else if (rightCategory === "magic" && leftCategory === "barrier") {
    consumePp(right, rightAction);
    applyDamage(left, right, reflectionDamage(rightAction, right, right.stats.defense), "バリア反射");
    if (left.chargeMultiplier > 1) left.chargeMultiplier = 1;
    if (right.chargeMultiplier > 1) right.chargeMultiplier = 1;
  } else if (winner === null) {
    processStrike(speedFirst, speedFirst.id === left.id ? leftAction : rightAction, speedSecond, speedSecond.id === left.id ? leftAction : rightAction);
    processStrike(speedSecond, speedSecond.id === left.id ? leftAction : rightAction, speedFirst, speedFirst.id === left.id ? leftAction : rightAction);
  } else {
    processStrike(left, leftAction, right, rightAction);
    processStrike(right, rightAction, left, leftAction);
  }

  left.lastActionCategory = leftCategory;
  right.lastActionCategory = rightCategory;

  const winnerId = left.currentHp <= 0 && right.currentHp <= 0 ? null : left.currentHp <= 0 ? right.id : right.currentHp <= 0 ? left.id : null;

  return {
    turn: params.turn,
    actions: params.actions,
    logs,
    damageEvents,
    winnerId,
    nextStates: {
      [left.id]: left,
      [right.id]: right,
    },
  };
}
