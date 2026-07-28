/**
 * Tests for the isResolvingTurn state machine introduced to prevent the
 * action-button softlock described in:
 *   「技選択後のHPやPPの増減など、行動している間は技の選択ボタンを画面内から
 *    隠し、アニメーション・ターン経過・カウントダウンリセット等全て次のターンに
 *    無事進んだのを確認してから技の選択ボタンを表示したらどうか？」
 *
 * The isResolvingTurn flag in page.tsx provides a structural fail-safe that
 * removes the action buttons from the DOM as soon as the player submits an
 * action. It stays true until BOTH:
 *   (a) the turn number has advanced past the turn where the action was submitted
 *   (b) the countdown has been reset to the full TURN_SECONDS window
 *
 * This simulates the state machine using a synchronous helper so no React or
 * real timers are needed.
 */

import assert from "node:assert/strict";
import test from "node:test";

const TURN_SECONDS = 30;

// ---------------------------------------------------------------------------
// Minimal simulation of the isResolvingTurn state machine from page.tsx.
// ---------------------------------------------------------------------------

function createResolvingTurnTracker() {
  let isResolvingTurn = false;
  let resolvingTurnNumber: number | null = null;
  let turn = 1;
  let turnCountdown = TURN_SECONDS;

  // Mirrors onActionSelect: player confirms action for the current turn.
  function selectAction() {
    isResolvingTurn = true;
    resolvingTurnNumber = turn;
  }

  // Mirrors the part of finalizeTurn / handleWire that advances the turn and
  // resets the countdown (setTurn + startCountdown).
  function advanceTurn(newCountdown = TURN_SECONDS) {
    turn += 1;
    turnCountdown = newCountdown;
    // Mirrors the useEffect in page.tsx that clears isResolvingTurn.
    if (isResolvingTurn && resolvingTurnNumber !== null) {
      if (turn > resolvingTurnNumber && turnCountdown >= TURN_SECONDS) {
        isResolvingTurn = false;
        resolvingTurnNumber = null;
      }
    }
  }

  // Mirrors countdown ticking down (turnCountdown update from setInterval).
  function tickCountdown(value: number) {
    turnCountdown = value;
    if (isResolvingTurn && resolvingTurnNumber !== null) {
      if (turn > resolvingTurnNumber && turnCountdown >= TURN_SECONDS) {
        isResolvingTurn = false;
        resolvingTurnNumber = null;
      }
    }
  }

  // Mirrors beginBattle / applyRematch: reset everything.
  function reset() {
    isResolvingTurn = false;
    resolvingTurnNumber = null;
    turn = 1;
    turnCountdown = TURN_SECONDS;
  }

  return {
    selectAction,
    advanceTurn,
    tickCountdown,
    reset,
    get isResolvingTurn() { return isResolvingTurn; },
    get turn() { return turn; },
    get turnCountdown() { return turnCountdown; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("initial state: isResolvingTurn is false", () => {
  const tracker = createResolvingTurnTracker();
  assert.equal(tracker.isResolvingTurn, false);
});

test("selecting action sets isResolvingTurn to true", () => {
  const tracker = createResolvingTurnTracker();
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);
});

test("turn advances with countdown reset clears isResolvingTurn", () => {
  const tracker = createResolvingTurnTracker();
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);

  // Simulate finalizeTurn: turn increments + countdown resets to 30
  tracker.advanceTurn(TURN_SECONDS);
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 2);
});

test("turn advances but countdown not yet reset keeps isResolvingTurn true", () => {
  // Guest scenario: turn_result arrives first (sets turn=2) before turn_start
  // resets the countdown. isResolvingTurn must stay true until both conditions met.
  // We simulate this with a manual state machine since our helper sets both together.
  let resolving = true;
  const resolvingNum = 1;
  const currentTurn = 2; // already advanced by turn_result
  let countdown = 27; // not yet reset (still counting down from old turn)

  function checkClear() {
    if (resolving && currentTurn > resolvingNum && countdown >= TURN_SECONDS) {
      resolving = false;
    }
  }
  checkClear();
  assert.equal(resolving, true, "isResolvingTurn should still be true with countdown=27");

  // Now turn_start arrives: countdown resets to 30
  countdown = 30;
  checkClear();
  assert.equal(resolving, false, "isResolvingTurn should clear once countdown resets to 30");
});

test("isResolvingTurn stays true until both conditions met simultaneously", () => {
  const tracker = createResolvingTurnTracker();
  tracker.selectAction();

  // Turn has NOT advanced yet but countdown ticks down (would not clear)
  tracker.tickCountdown(29);
  assert.equal(tracker.isResolvingTurn, true, "countdown ticked but turn not advanced");

  // Turn advances but countdown hasn't reset yet (< 30)
  const currentTurn2 = 2;
  const resolvingNum2 = 1;
  let resolving2 = true;
  let countdown2 = 25;

  function checkClear2() {
    if (resolving2 && currentTurn2 > resolvingNum2 && countdown2 >= TURN_SECONDS) {
      resolving2 = false;
    }
  }
  checkClear2();
  assert.equal(resolving2, true, "turn advanced but countdown still < 30");

  // Both conditions now met
  countdown2 = 30;
  checkClear2();
  assert.equal(resolving2, false, "both conditions met: should clear");
});

test("reset clears isResolvingTurn (beginBattle / applyRematch scenario)", () => {
  const tracker = createResolvingTurnTracker();
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);

  tracker.reset();
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 1);
  assert.equal(tracker.turnCountdown, TURN_SECONDS);
});

test("rapid multi-turn: selecting action then advancing multiple turns stays consistent", () => {
  const tracker = createResolvingTurnTracker();

  // Turn 1 → select → advance
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);
  tracker.advanceTurn(TURN_SECONDS);
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 2);

  // Turn 2 → select → advance
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);
  tracker.advanceTurn(TURN_SECONDS);
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 3);

  // Turn 3 → select → advance
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);
  tracker.advanceTurn(TURN_SECONDS);
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 4);
});

test("battle-end scenario: isResolvingTurn cleared on battleFinish even without turn advance", () => {
  // If the player's action causes the battle to end, finalizeTurn sets battleFinish
  // but does NOT call setTurn or startHostTurn, so the turn never increments.
  // The battleFinish useEffect must clear isResolvingTurn manually.
  const tracker = createResolvingTurnTracker();
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);

  // Simulate the battleFinish useEffect in page.tsx
  tracker.reset();
  assert.equal(tracker.isResolvingTurn, false);
});

test("no action selected: isResolvingTurn stays false when turn advances via timer", () => {
  // If the turn timer fires before the player selects (they never clicked),
  // isResolvingTurn should remain false the whole time.
  const tracker = createResolvingTurnTracker();
  assert.equal(tracker.isResolvingTurn, false);

  // Timer fires → turn advances without player clicking
  tracker.advanceTurn(TURN_SECONDS);
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 2);
});
