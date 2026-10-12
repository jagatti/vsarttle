import assert from "node:assert/strict";
import test from "node:test";
import { createTurnResolutionGuard } from "./turnResolutionGuard";

type Outcome = "continue" | "enemy_ko" | "player_ko_next_char" | "player_ko_lose" | "limit_break";

/**
 * Minimal model of the CPU-mode managers (SinglePlay / Roguelike / GhostMatch):
 * onActionSelect → finalizeTurn(turnRef) → post-turn timer (POST_TURN_DELAY_MS)
 * → setTurn(next) + startCountdown + scheduleAutoAction.
 */
function createCpuBattleSimulator(outcomes: Outcome[]) {
  const guard = createTurnResolutionGuard();
  let isResolvingTurn = false; // mirrors the React state passed to BattlePanel
  const sync = () => { isResolvingTurn = guard.isResolving(); };

  let turn = 1;
  let pendingAction: string | null = null;
  let postTurnTimer: (() => void) | null = null;
  let autoTimer: { turn: number; fire: () => void } | null = null;
  let stage: "battle" | "char_select" | "finished" | "transition" = "battle";
  let transitionTimer: (() => void) | null = null;
  const resolved: Array<{ turn: number; action: string | null }> = [];
  let outcomeIndex = 0;

  function scheduleAutoAction(turnNumber: number) {
    guard.startTurn();
    sync();
    autoTimer = {
      turn: turnNumber,
      fire: () => {
        autoTimer = null;
        finalizeTurn(turnNumber, pendingAction);
      },
    };
  }

  function startBattle(startTurn = 1) {
    guard.prepareBattle();
    sync();
    turn = startTurn;
    stage = "battle";
    pendingAction = null;
    scheduleAutoAction(startTurn);
  }

  function finalizeTurn(turnNumber: number, action: string | null) {
    if (!guard.beginResolution(turnNumber)) return;
    sync();
    autoTimer = null;
    pendingAction = null;
    resolved.push({ turn: turnNumber, action });
    const outcome = outcomes[outcomeIndex++] ?? "continue";
    postTurnTimer = () => {
      postTurnTimer = null;
      if (outcome === "enemy_ko" || outcome === "player_ko_lose") {
        stage = "finished";
        guard.reset();
        sync();
        return;
      }
      if (outcome === "player_ko_next_char") {
        stage = "char_select";
        guard.reset();
        sync();
        return;
      }
      if (outcome === "limit_break") {
        // Guard stays held during the transformation, then the next turn starts.
        stage = "transition";
        transitionTimer = () => {
          transitionTimer = null;
          stage = "battle";
          turn = turnNumber + 1;
          scheduleAutoAction(turn);
        };
        return;
      }
      turn = turnNumber + 1;
      scheduleAutoAction(turn);
    };
  }

  function onActionSelect(action: string) {
    if (!guard.canSelectAction(turn)) return false;
    if (pendingAction) return false;
    pendingAction = action;
    finalizeTurn(turn, action);
    return true;
  }

  return {
    startBattle,
    onActionSelect,
    firePostTurn: () => postTurnTimer?.(),
    fireAutoTimer: () => autoTimer?.fire(),
    fireTransition: () => transitionTimer?.(),
    get turn() { return turn; },
    get stage() { return stage; },
    get isResolvingTurn() { return isResolvingTurn; },
    get resolved() { return [...resolved]; },
    get hasPostTurnTimer() { return postTurnTimer !== null; },
    get autoTimerTurn() { return autoTimer?.turn ?? null; },
  };
}

test("guard: beginResolution is idempotent per turn number", () => {
  const guard = createTurnResolutionGuard();
  assert.equal(guard.beginResolution(1), true);
  assert.equal(guard.beginResolution(1), false);
  guard.startTurn();
  assert.equal(guard.beginResolution(1), false, "already finalized turn must stay rejected");
  assert.equal(guard.beginResolution(2), true);
  assert.equal(guard.lastFinalizedTurn(), 2);
});

test("guard: prepareBattle restarts the turn counter but blocks actions until startTurn", () => {
  const guard = createTurnResolutionGuard();
  guard.beginResolution(5);
  guard.prepareBattle();
  assert.equal(guard.isResolving(), true);
  assert.equal(guard.canSelectAction(1), false);
  guard.startTurn();
  assert.equal(guard.canSelectAction(1), true);
  assert.equal(guard.beginResolution(1), true);
});

test("race: second selection before the post-turn timer is ignored and turn N resolves once", () => {
  const sim = createCpuBattleSimulator(["continue", "continue"]);
  sim.startBattle();
  assert.equal(sim.isResolvingTurn, false);

  assert.equal(sim.onActionSelect("attack"), true);
  assert.equal(sim.isResolvingTurn, true, "buttons must stay hidden until the next turn starts");

  // BattlePanel animation already finished, user clicks again before POST_TURN_DELAY_MS.
  assert.equal(sim.onActionSelect("charge"), false);
  assert.equal(sim.onActionSelect("barrier"), false);
  assert.deepEqual(sim.resolved, [{ turn: 1, action: "attack" }]);
  assert.equal(sim.turn, 1);

  sim.firePostTurn();
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false, "guard released once the next turn starts");
  assert.equal(sim.autoTimerTurn, 2);
  assert.equal(sim.hasPostTurnTimer, false);

  assert.equal(sim.onActionSelect("charge"), true);
  assert.deepEqual(sim.resolved, [
    { turn: 1, action: "attack" },
    { turn: 2, action: "charge" },
  ]);
});

test("auto-timeout path still resolves the turn and is not duplicated by a late click", () => {
  const sim = createCpuBattleSimulator(["continue"]);
  sim.startBattle();
  sim.fireAutoTimer();
  assert.deepEqual(sim.resolved, [{ turn: 1, action: null }]);
  assert.equal(sim.onActionSelect("attack"), false);
  sim.firePostTurn();
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false);
  sim.fireAutoTimer();
  assert.deepEqual(sim.resolved.map((r) => r.turn), [1, 2]);
});

test("enemy KO branch releases the guard", () => {
  const sim = createCpuBattleSimulator(["enemy_ko"]);
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.onActionSelect("attack");
  sim.firePostTurn();
  assert.equal(sim.stage, "finished");
  assert.equal(sim.isResolvingTurn, false);
  assert.equal(sim.resolved.length, 1);
});

test("player KO → lose branch releases the guard", () => {
  const sim = createCpuBattleSimulator(["player_ko_lose"]);
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.firePostTurn();
  assert.equal(sim.stage, "finished");
  assert.equal(sim.isResolvingTurn, false);
});

test("player KO → next character resumes the battle with the next turn number", () => {
  const sim = createCpuBattleSimulator(["continue", "player_ko_next_char", "continue"]);
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.firePostTurn();
  sim.onActionSelect("attack");
  sim.firePostTurn();
  assert.equal(sim.stage, "char_select");
  assert.equal(sim.isResolvingTurn, false);

  // Resume battle with the next character at turn 3.
  sim.startBattle(3);
  assert.equal(sim.isResolvingTurn, false);
  assert.equal(sim.onActionSelect("barrier"), true);
  assert.deepEqual(sim.resolved.map((r) => r.turn), [1, 2, 3]);
});

test("new battle with restarted turn counter can finalize turn 1 again", () => {
  const sim = createCpuBattleSimulator(["enemy_ko", "continue"]);
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.firePostTurn();
  sim.startBattle(1);
  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolved.map((r) => r.turn), [1, 1]);
});

test("limit break transition keeps actions blocked until the next turn starts", () => {
  const sim = createCpuBattleSimulator(["limit_break", "continue"]);
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.firePostTurn();
  assert.equal(sim.stage, "transition");
  assert.equal(sim.isResolvingTurn, true);
  assert.equal(sim.onActionSelect("attack"), false);

  sim.fireTransition();
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false);
  assert.equal(sim.onActionSelect("charge"), true);
  assert.deepEqual(sim.resolved.map((r) => r.turn), [1, 2]);
});
