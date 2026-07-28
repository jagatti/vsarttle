/**
 * Tests for the turn-cycle race condition described in:
 *   「ターン開始直後(29秒)に技を選択するとソフトロックが発生する」
 *
 * Root cause: a stale turn_action wire message arriving after finalizeTurn(N) had
 * already run could be combined with the host's already-stored action for turn N+1
 * in pendingActionsRef, making maybeFinalizeTurnEarly see "both actions present" for
 * the old turn. This triggered scheduleTurnFinalize(N, 0), which silently cancelled
 * the live timer for turn N+1 and re-ran finalizeTurn(N) with wrong battle state and
 * mixed actions — corrupting the battle and causing a softlock.
 *
 * The fixes in page.tsx address this with three layers:
 *   1. finalizedTurnRef idempotency guard in finalizeTurn
 *   2. finalizedTurnRef guard in scheduleTurnFinalize (prevents cancelling next-turn timer)
 *   3. Stale turn_action discard in handleWire
 *
 * These tests use a lightweight simulation of the host-side turn cycle to verify
 * the invariants without importing the full React component.
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Minimal simulation of the host-side turn cycle (mirrors page.tsx logic).
// Uses a fully synchronous fake timer system so no real async work is created
// and the test process exits cleanly.
// ---------------------------------------------------------------------------

interface SimAction {
  turn: number;
  playerId: string;
  action: string;
}

function createTurnCycleSimulator() {
  let finalizedTurn = 0;
  const pendingActions: Record<string, string> = {};
  // Fake timer: just record what is scheduled; firing is driven by fireTimer().
  let fakeTimerHandle: number | null = null;
  let scheduledForTurn: number | null = null;
  let nextTimerId = 1;
  const finalizeCalls: number[] = [];
  const scheduleCalls: Array<{ turn: number; delay: number }> = [];

  // Mirrors scheduleTurnFinalize in page.tsx
  function scheduleTurnFinalize(turnNumber: number, delayMs: number) {
    scheduleCalls.push({ turn: turnNumber, delay: delayMs });
    // Guard: skip if this turn is already finalized (fix #2)
    if (finalizedTurn >= turnNumber) return;
    // Cancel any existing fake timer
    fakeTimerHandle = null;
    scheduledForTurn = turnNumber;
    fakeTimerHandle = nextTimerId++;
  }

  // Mirrors finalizeTurn in page.tsx
  function finalizeTurn(turnNumber: number) {
    // Idempotency guard (fix #1)
    if (finalizedTurn >= turnNumber) return;
    finalizedTurn = turnNumber;
    finalizeCalls.push(turnNumber);
    // Clear pending actions
    for (const k of Object.keys(pendingActions)) delete pendingActions[k];
    // Simulate startHostTurn for next turn
    scheduleTurnFinalize(turnNumber + 1, 30000);
  }

  // Mirrors handleWire "turn_action" path in page.tsx
  function receiveAction(msg: SimAction) {
    // Stale action filter (fix #3)
    if (msg.turn <= finalizedTurn) return;
    pendingActions[msg.playerId] = msg.action;
    // Simplified maybeFinalizeTurnEarly: if both players have actions, finalize now
    if (pendingActions["host"] && pendingActions["guest"]) {
      scheduleTurnFinalize(msg.turn, 0);
    }
  }

  // Mirrors host's onActionSelect (host stores own action and calls maybeFinalizeTurnEarly)
  function hostSelectAction(turnNumber: number, action: string) {
    pendingActions["host"] = action;
    if (pendingActions["host"] && pendingActions["guest"]) {
      scheduleTurnFinalize(turnNumber, 0);
    }
  }

  // Fire the currently scheduled timer immediately (simulates time passing).
  // Must clear scheduledForTurn/fakeTimerHandle BEFORE invoking finalizeTurn so
  // that when finalizeTurn internally calls scheduleTurnFinalize for the next turn,
  // the fresh scheduledForTurn value is not clobbered by the caller.
  function fireTimer() {
    if (fakeTimerHandle !== null) {
      fakeTimerHandle = null;
      const turnToFinalize = scheduledForTurn;
      scheduledForTurn = null;
      if (turnToFinalize !== null) {
        finalizeTurn(turnToFinalize);
      }
    }
  }

  return {
    scheduleTurnFinalize,
    finalizeTurn,
    receiveAction,
    hostSelectAction,
    fireTimer,
    get finalizedTurn() { return finalizedTurn; },
    get pendingActions() { return { ...pendingActions }; },
    get finalizeCalls() { return [...finalizeCalls]; },
    get scheduleCalls() { return [...scheduleCalls]; },
    get hasActiveTimer() { return fakeTimerHandle !== null; },
    get scheduledForTurn() { return scheduledForTurn; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("normal turn progression: finalize once, timer advances to next turn", () => {
  const sim = createTurnCycleSimulator();

  // Turn 1 starts
  sim.scheduleTurnFinalize(1, 30000);
  // Timer fires (30s elapsed)
  sim.fireTimer();

  assert.equal(sim.finalizedTurn, 1);
  assert.deepEqual(sim.finalizeCalls, [1]);
  // After finalizeTurn(1), scheduleTurnFinalize(2, 30000) is called
  assert.equal(sim.scheduledForTurn, 2);
});

test("early finalization: both actions present → finalize without waiting for timer", () => {
  const sim = createTurnCycleSimulator();

  // Turn 1 starts with 30s timer
  sim.scheduleTurnFinalize(1, 30000);

  // Host selects action at 29s remaining
  sim.hostSelectAction(1, "attack");
  // Guest action arrives
  sim.receiveAction({ turn: 1, playerId: "guest", action: "barrier" });

  // Timer was rescheduled to 0ms → fire it
  sim.fireTimer();

  assert.equal(sim.finalizedTurn, 1);
  assert.deepEqual(sim.finalizeCalls, [1]);
  // pendingActions cleared after finalize
  assert.deepEqual(sim.pendingActions, {});
  // Next turn timer is live
  assert.equal(sim.scheduledForTurn, 2);
});

test("idempotency guard: finalizeTurn(N) called twice only executes once", () => {
  const sim = createTurnCycleSimulator();

  sim.scheduleTurnFinalize(1, 30000);
  sim.fireTimer(); // finalizeTurn(1) runs
  assert.equal(sim.finalizedTurn, 1);
  assert.deepEqual(sim.finalizeCalls, [1]);

  // Attempt to finalize turn 1 again directly
  sim.finalizeTurn(1);
  assert.deepEqual(sim.finalizeCalls, [1], "second call must be a no-op");
  assert.equal(sim.finalizedTurn, 1);
});

test("scheduleTurnFinalize guard: stale call does not cancel next-turn timer", () => {
  const sim = createTurnCycleSimulator();

  // Turn 1 fires → sets up timer for turn 2
  sim.scheduleTurnFinalize(1, 30000);
  sim.fireTimer(); // finalizeTurn(1) done; turn 2 timer is now active
  assert.equal(sim.scheduledForTurn, 2);

  // Stale scheduleTurnFinalize(1, ...) call (e.g. from a late-arriving turn_action)
  // must NOT cancel the turn 2 timer
  sim.scheduleTurnFinalize(1, 0);
  assert.equal(sim.scheduledForTurn, 2, "turn 2 timer must still be active");
  assert.equal(sim.finalizedTurn, 1, "finalizedTurn must not regress");
});

test("stale turn_action filter: late guest action for old turn is discarded", () => {
  const sim = createTurnCycleSimulator();

  // Turn 1 fires via 30s timer (host selected, guest didn't in time)
  sim.scheduleTurnFinalize(1, 30000);
  sim.hostSelectAction(1, "attack");
  sim.fireTimer(); // timer fires, finalizeTurn(1)
  assert.equal(sim.finalizedTurn, 1);

  // Now turn 2 timer is active and host has selected for turn 2
  sim.hostSelectAction(2, "charge");

  // Stale guest action for turn 1 arrives late
  const finalizesBeforeStaleAction = sim.finalizeCalls.length;
  const scheduledTurnBeforeStaleAction = sim.scheduledForTurn;
  sim.receiveAction({ turn: 1, playerId: "guest", action: "barrier" });

  // The stale action should be discarded — no new finalize call, turn 2 timer unchanged
  assert.equal(sim.finalizeCalls.length, finalizesBeforeStaleAction,
    "stale turn_action must not trigger additional finalize calls");
  assert.equal(sim.scheduledForTurn, scheduledTurnBeforeStaleAction,
    "stale turn_action must not cancel or replace the active next-turn timer");
  assert.equal(sim.finalizedTurn, 1, "finalizedTurn must not change");
});

test("race condition scenario: late guest action + host next-turn action do not softlock", () => {
  // Reproduces the reported bug:
  // Turn N fires → host selects for turn N+1 → late guest action for N arrives
  // Old code: pendingActions[host]=N+1 action, pendingActions[guest]=N action → both
  //           "present" → scheduleTurnFinalize(N, 0) → cancels N+1 timer → bad finalize
  // New code: stale guest action is discarded → no corruption

  const sim = createTurnCycleSimulator();

  // Turn 2 starts
  sim.scheduleTurnFinalize(2, 30000);
  // Host selects at 29s remaining
  sim.hostSelectAction(2, "attack");
  // 30s timer fires (guest never selected in time)
  sim.fireTimer(); // finalizeTurn(2)
  assert.equal(sim.finalizedTurn, 2);
  assert.deepEqual(sim.finalizeCalls, [2]);
  assert.equal(sim.scheduledForTurn, 3); // turn 3 timer live

  // Host selects action for turn 3 (after animation ends)
  sim.hostSelectAction(3, "charge");

  // Late guest turn_action for turn 2 arrives now
  sim.receiveAction({ turn: 2, playerId: "guest", action: "barrier" });

  // The turn 3 timer must still be active — no softlock
  assert.equal(sim.scheduledForTurn, 3, "turn 3 timer must not be cancelled");
  assert.deepEqual(sim.finalizeCalls, [2], "turn 2 must not be finalized again");
  assert.equal(sim.finalizedTurn, 2, "finalizedTurn must remain 2");

  // Turn 3 fires normally
  sim.receiveAction({ turn: 3, playerId: "guest", action: "attack" });
  sim.fireTimer(); // finalizeTurn(3)
  assert.equal(sim.finalizedTurn, 3);
  assert.deepEqual(sim.finalizeCalls, [2, 3], "turn 3 must finalize correctly");
});

test("paralysis scenario: both-paralyzed early finalize still blocked by guard if already done", () => {
  // When battleState shows both players paralyzed for the upcoming turn,
  // maybeFinalizeTurnEarly schedules a short 3s timer even without pending actions.
  // Ensure that a stale call cannot interfere.
  const sim = createTurnCycleSimulator();

  sim.scheduleTurnFinalize(1, 30000);
  sim.fireTimer(); // finalizeTurn(1) done
  assert.equal(sim.finalizedTurn, 1);

  // Simulate the paralysis path calling scheduleTurnFinalize(1, 3000) stale
  const timerBefore = sim.scheduledForTurn;
  sim.scheduleTurnFinalize(1, 3000); // stale call — should be ignored
  assert.equal(sim.scheduledForTurn, timerBefore,
    "stale paralysis scheduleTurnFinalize must not change active timer");
});
