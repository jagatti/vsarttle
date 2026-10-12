/**
 * Tests for 「技選択ボタンが出てすぐクリックすると、技が出ずに進行が止まる」.
 *
 * In the CPU-opponent managers (SinglePlay / Roguelike / GhostMatch) BattlePanel
 * re-shows the action buttons after the reveal animation (~2.85–3.7s), but the
 * manager only advances to the next turn after POST_TURN_DELAY_MS (4200ms).
 * A click in that window used to call finalizeTurn(turnRef.current) (still turn N)
 * again, re-resolving turn N and scheduling a second post-turn callback.
 *
 * These tests drive a lightweight, fully synchronous simulation of the manager
 * turn cycle that uses the real createTurnResolutionGuard().
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createTurnResolutionGuard } from "./turnResolutionGuard";

const POST_TURN_DELAY_MS = 4200;
const TURN_SECONDS_MS = 30_000;

type Outcome = "continue" | "enemy_defeated" | "player_ko_next_char" | "player_ko_lose" | "limit_break" | "boss_phase2";

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout(fn: () => void, ms: number) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id: number | null) {
      if (id !== null) timers.delete(id);
    },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Infinity;
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < dueAt) {
            dueAt = timer.at;
            dueId = id;
          }
        }
        if (dueId === null) break;
        const timer = timers.get(dueId)!;
        timers.delete(dueId);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
  };
}

/** Mirrors the guarded manager turn cycle (finalizeTurn → post-turn timer → next turn). */
function createManagerSim() {
  const timers = createFakeTimers();
  const guard = createTurnResolutionGuard();
  let isResolvingTurnState = false;
  let turn = 1;
  let turnTimer: number | null = null;
  let postTurnTimer: number | null = null;
  let pendingAction: string | null = null;
  let nextOutcome: Outcome = "continue";
  const resolvedTurns: number[] = [];
  const postTurnRuns: number[] = [];
  const stages: string[] = [];

  const release = () => {
    guard.release();
    isResolvingTurnState = false;
  };
  const reset = () => {
    guard.reset();
    isResolvingTurnState = false;
  };

  function scheduleAutoAction(turnNumber: number) {
    timers.clearTimeout(turnTimer);
    turnTimer = timers.setTimeout(() => finalizeTurn(turnNumber), TURN_SECONDS_MS);
  }

  function startBattle(startTurn = 1) {
    turn = startTurn;
    pendingAction = null;
    reset();
    scheduleAutoAction(startTurn);
  }

  function finalizeTurn(turnNumber: number) {
    if (!guard.tryBegin(turnNumber)) return;
    isResolvingTurnState = true;
    timers.clearTimeout(turnTimer);
    pendingAction = null;
    resolvedTurns.push(turnNumber);
    const outcome = nextOutcome;
    nextOutcome = "continue";
    timers.clearTimeout(postTurnTimer);
    postTurnTimer = timers.setTimeout(() => {
      postTurnTimer = null;
      postTurnRuns.push(turnNumber);
      switch (outcome) {
        case "enemy_defeated":
          stages.push("floor_win");
          release();
          return;
        case "player_ko_next_char":
          stages.push("char_select");
          release();
          return;
        case "player_ko_lose":
          stages.push("floor_lose");
          release();
          return;
        case "limit_break":
          // Glow + overlay, then the turn counter continues at turnNumber + 1.
          timers.setTimeout(() => {
            turn = turnNumber + 1;
            scheduleAutoAction(turn);
            release();
          }, 5000);
          return;
        case "boss_phase2":
          // Transform overlay, then a fresh battle that restarts at turn 1.
          timers.setTimeout(() => {
            startBattle(1);
          }, 2500);
          return;
        default:
          turn = turnNumber + 1;
          scheduleAutoAction(turn);
          release();
      }
    }, POST_TURN_DELAY_MS);
  }

  function onActionSelect(action: string) {
    if (!guard.canBegin(turn)) return false;
    if (pendingAction) return false;
    pendingAction = action;
    finalizeTurn(turn);
    return true;
  }

  return {
    timers,
    guard,
    startBattle,
    onActionSelect,
    setNextOutcome(outcome: Outcome) {
      nextOutcome = outcome;
    },
    get turn() {
      return turn;
    },
    get isResolvingTurn() {
      return isResolvingTurnState;
    },
    get pendingAction() {
      return pendingAction;
    },
    resolvedTurns,
    postTurnRuns,
    stages,
  };
}

test("createTurnResolutionGuard: tryBegin blocks while resolving and for already finalized turns", () => {
  const guard = createTurnResolutionGuard();
  assert.equal(guard.isResolving, false);
  assert.equal(guard.lastFinalizedTurn, 0);

  assert.equal(guard.tryBegin(1), true);
  assert.equal(guard.isResolving, true);
  assert.equal(guard.lastFinalizedTurn, 1);
  assert.equal(guard.canBegin(2), false, "blocked while resolving");
  assert.equal(guard.tryBegin(2), false, "blocked while resolving");

  guard.release();
  assert.equal(guard.isResolving, false);
  assert.equal(guard.canBegin(1), false, "turn 1 already finalized");
  assert.equal(guard.tryBegin(1), false, "turn 1 already finalized");
  assert.equal(guard.tryBegin(0), false);
  assert.equal(guard.canBegin(2), true);
  assert.equal(guard.tryBegin(2), true);

  guard.reset();
  assert.equal(guard.isResolving, false);
  assert.equal(guard.lastFinalizedTurn, 0);
  assert.equal(guard.tryBegin(1), true, "turn numbers can restart at 1 after reset");
});

test("race: a click after the buttons re-appear but before the post-turn timer is ignored", () => {
  const sim = createManagerSim();
  sim.startBattle();

  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolvedTurns, [1]);
  assert.equal(sim.isResolvingTurn, true, "buttons must stay hidden after finalizeTurn");

  // BattlePanel's own animation lock clears at ~2.85s–3.7s, i.e. before 4.2s.
  sim.timers.advance(3000);
  assert.equal(sim.turn, 1, "turn has not advanced yet");
  assert.equal(sim.onActionSelect("magic"), false, "second selection ignored");
  assert.equal(sim.pendingAction, null, "ignored click must not leave a stale pending action");
  assert.deepEqual(sim.resolvedTurns, [1], "turn 1 resolved exactly once");

  sim.timers.advance(POST_TURN_DELAY_MS - 3000);
  assert.deepEqual(sim.postTurnRuns, [1], "post-turn callback runs exactly once");
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false, "guard released once the next turn starts");

  assert.equal(sim.onActionSelect("magic"), true, "next turn accepts a selection");
  assert.deepEqual(sim.resolvedTurns, [1, 2]);
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.deepEqual(sim.postTurnRuns, [1, 2]);
  assert.equal(sim.turn, 3);
});

test("auto-timeout path still resolves turns and cannot double-resolve with a click", () => {
  const sim = createManagerSim();
  sim.startBattle();

  sim.timers.advance(TURN_SECONDS_MS);
  assert.deepEqual(sim.resolvedTurns, [1], "auto action resolves turn 1");
  assert.equal(sim.onActionSelect("attack"), false);

  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false);

  sim.timers.advance(TURN_SECONDS_MS);
  assert.deepEqual(sim.resolvedTurns, [1, 2]);
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.deepEqual(sim.postTurnRuns, [1, 2]);
  assert.equal(sim.turn, 3);
});

test("guard is released on enemy defeat and player KO branches", () => {
  for (const outcome of ["enemy_defeated", "player_ko_next_char", "player_ko_lose"] as const) {
    const sim = createManagerSim();
    sim.startBattle();
    sim.setNextOutcome(outcome);
    sim.onActionSelect("attack");
    assert.equal(sim.isResolvingTurn, true);
    sim.timers.advance(POST_TURN_DELAY_MS);
    assert.equal(sim.isResolvingTurn, false, `${outcome}: guard released`);
    assert.equal(sim.guard.isResolving, false, `${outcome}: guard ref released`);
    // Stale finalize of the old turn is still rejected after release.
    assert.equal(sim.guard.canBegin(1), false);
  }
});

test("new battle / next character / floor resets allow turn numbers to restart at 1", () => {
  const sim = createManagerSim();
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  sim.setNextOutcome("enemy_defeated");
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.deepEqual(sim.stages, ["floor_win"]);

  // Next floor starts at turn 1 again.
  sim.startBattle(1);
  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolvedTurns, [1, 2, 1]);

  // KO → next character resumes the same battle at turnRef + 1.
  sim.timers.advance(POST_TURN_DELAY_MS);
  sim.setNextOutcome("player_ko_next_char");
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.equal(sim.turn, 2);
  sim.startBattle(sim.turn + 1);
  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolvedTurns, [1, 2, 1, 2, 3]);
});

test("limit break keeps the guard until the continued turn starts", () => {
  const sim = createManagerSim();
  sim.startBattle();
  sim.setNextOutcome("limit_break");
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.equal(sim.isResolvingTurn, true, "still resolving during the limit-break overlay");
  assert.equal(sim.onActionSelect("attack"), false);

  sim.timers.advance(5000);
  assert.equal(sim.turn, 2);
  assert.equal(sim.isResolvingTurn, false);
  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolvedTurns, [1, 2]);
});

test("boss phase 2 transformation restarts at turn 1 and releases the guard", () => {
  const sim = createManagerSim();
  sim.startBattle();
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  sim.setNextOutcome("boss_phase2");
  sim.onActionSelect("attack");
  sim.timers.advance(POST_TURN_DELAY_MS);
  assert.equal(sim.isResolvingTurn, true, "still resolving during the transform overlay");

  sim.timers.advance(2500);
  assert.equal(sim.turn, 1);
  assert.equal(sim.isResolvingTurn, false);
  assert.equal(sim.onActionSelect("attack"), true);
  assert.deepEqual(sim.resolvedTurns, [1, 2, 1]);
});
