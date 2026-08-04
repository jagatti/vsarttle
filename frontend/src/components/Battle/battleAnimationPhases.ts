import type { ActionCategory, ActionType, PlayerBattleState, TurnChargeEvent, TurnDamageEvent, TurnResult } from "@/types/game";
import { actionCategory } from "@/lib/battleLogic";

export interface DisplayBattleResources {
  currentHp: number;
  currentPp: number;
}

/**
 * わざモーションの種別。フェーズごとにactorが実行する演出を表す。
 * - attackLunge: こうげき（突撃モーション）
 * - chargeConcentration: チャージ（集中線モーション）
 * - magicBlast: まほう（エネルギー弾発射）
 * - magicReflect: まほう → バリア反射（弾が返ってくる）
 * - barrierWall: バリア（光の壁を張る）
 * - barrierBreak: バリア（こうげきで割れる）
 * - barrierClash: バリア対バリア（壁同士の衝突）
 * - none: 専用モーションなし
 */
export type MoveMotionType =
  | "attackLunge"
  | "chargeConcentration"
  | "magicBlast"
  | "magicReflect"
  | "barrierWall"
  | "barrierBreak"
  | "barrierClash"
  | "none";

export interface TurnAnimationPhase {
  actorId: string;
  damageEvents: TurnDamageEvent[];
  chargeEvents: TurnChargeEvent[];
  /** actor が実行するわざモーション種別 */
  motionType?: MoveMotionType;
  /** actor 以外のプレイヤーに適用する追加モーション（例：バリア割れ） */
  targetMotionType?: MoveMotionType;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildDisplayBattleResources(players: PlayerBattleState[]): Record<string, DisplayBattleResources> {
  return Object.fromEntries(players.map((player) => [player.id, { currentHp: player.currentHp, currentPp: player.currentPp }]));
}

export function getTurnAnimationOrder(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): [string, string] {
  const myAction = turnResult.actions[me.id];
  const enemyAction = turnResult.actions[enemy.id];

  if (myAction === "charge" && enemyAction !== "charge") return [me.id, enemy.id];
  if (enemyAction === "charge" && myAction !== "charge") return [enemy.id, me.id];
  if (me.stats.speed >= enemy.stats.speed) return [me.id, enemy.id];
  return [enemy.id, me.id];
}

function getDamagePhaseActorId(event: TurnDamageEvent, actions: Record<string, ActionType>): string {
  if (event.reason === "バリア反射") {
    return Object.keys(actions).find((playerId) => actions[playerId] === "magicWeak" || actions[playerId] === "magicStrong") ?? event.to;
  }
  if (event.phaseHint === "counter") {
    return Object.keys(actions).find((playerId) => actions[playerId] === "charge") ?? event.to;
  }
  return event.from;
}

/**
 * アクションカテゴリからデフォルトのモーション種別を返すヘルパー。
 * 対戦相手のアクションによって上書きされる場合は getTurnAnimationPhases 内で上書く。
 */
function defaultMotionForAction(action: ActionType): MoveMotionType {
  const cat: ActionCategory = actionCategory(action);
  if (cat === "attack") return "attackLunge";
  if (cat === "magic") return "magicBlast";
  if (cat === "barrier") return "barrierWall";
  if (cat === "charge") return "chargeConcentration";
  return "none";
}

export function getTurnAnimationPhases(turnResult: TurnResult, me: PlayerBattleState, enemy: PlayerBattleState): TurnAnimationPhase[] {
  const [firstId, secondId] = getTurnAnimationOrder(turnResult, me, enemy);
  const phaseByActor: Record<string, TurnAnimationPhase> = {
    [firstId]: { actorId: firstId, damageEvents: [], chargeEvents: [] },
    [secondId]: { actorId: secondId, damageEvents: [], chargeEvents: [] },
  };

  for (const chargeEvent of turnResult.chargeEvents ?? []) {
    phaseByActor[chargeEvent.playerId]?.chargeEvents.push(chargeEvent);
  }

  for (const damageEvent of turnResult.damageEvents ?? []) {
    const actorId = getDamagePhaseActorId(damageEvent, turnResult.actions);
    phaseByActor[actorId]?.damageEvents.push(damageEvent);
  }

  // --- モーション種別の決定 ---
  const myAction = turnResult.actions[me.id];
  const enemyAction = turnResult.actions[enemy.id];
  if (myAction && enemyAction) {
    const myCategory = actionCategory(myAction);
    const enemyCategory = actionCategory(enemyAction);

    // バリア対まほう: まほう側は反射モーション、バリア側は通常バリア
    if (myCategory === "magic" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "magicReflect";
      phaseByActor[enemy.id].motionType = "barrierWall";
    } else if (enemyCategory === "magic" && myCategory === "barrier") {
      phaseByActor[enemy.id].motionType = "magicReflect";
      phaseByActor[me.id].motionType = "barrierWall";
    }
    // こうげき対バリア: こうげき側はattackLunge、バリア側はbarrierWall→barrierBreak
    else if (myCategory === "attack" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "attackLunge";
      phaseByActor[enemy.id].motionType = "barrierWall";
      phaseByActor[enemy.id].targetMotionType = "barrierBreak";
    } else if (enemyCategory === "attack" && myCategory === "barrier") {
      phaseByActor[enemy.id].motionType = "attackLunge";
      phaseByActor[me.id].motionType = "barrierWall";
      phaseByActor[me.id].targetMotionType = "barrierBreak";
    }
    // バリア対バリア: 両者バリアを張り衝突
    else if (myCategory === "barrier" && enemyCategory === "barrier") {
      phaseByActor[me.id].motionType = "barrierClash";
      phaseByActor[enemy.id].motionType = "barrierClash";
    }
    // それ以外: デフォルトモーション
    else {
      phaseByActor[me.id].motionType = defaultMotionForAction(myAction);
      phaseByActor[enemy.id].motionType = defaultMotionForAction(enemyAction);
    }
  }

  return [phaseByActor[firstId], phaseByActor[secondId]];
}

export function applyAnimationPhaseToDisplayResources(
  displayResources: Record<string, DisplayBattleResources>,
  playersById: Record<string, PlayerBattleState>,
  phase: TurnAnimationPhase,
): Record<string, DisplayBattleResources> {
  const next = { ...displayResources };

  for (const playerId of Object.keys(playersById)) {
    if (!next[playerId]) {
      next[playerId] = {
        currentHp: playersById[playerId].currentHp,
        currentPp: playersById[playerId].currentPp,
      };
    }
  }

  for (const chargeEvent of phase.chargeEvents) {
    const player = playersById[chargeEvent.playerId];
    if (!player) continue;
    next[chargeEvent.playerId] = {
      currentHp: clamp(next[chargeEvent.playerId].currentHp + chargeEvent.hpRecover, 0, player.stats.maxHp),
      currentPp: clamp(next[chargeEvent.playerId].currentPp + chargeEvent.ppRecover, 0, player.stats.maxPp),
    };
  }

  for (const damageEvent of phase.damageEvents) {
    if (damageEvent.avoided || damageEvent.amount <= 0) continue;
    const player = playersById[damageEvent.to];
    if (!player) continue;
    next[damageEvent.to] = {
      ...next[damageEvent.to],
      currentHp: clamp(next[damageEvent.to].currentHp - damageEvent.amount, 0, player.stats.maxHp),
    };
  }

  return next;
}
