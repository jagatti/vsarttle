import assert from "node:assert/strict";
import test from "node:test";

function createResolvingTurnTracker() {
  let isResolvingTurn = false;
  let resolvingTurnNumber: number | null = null;
  let resolvingEpoch: number | null = null;
  let turn = 1;
  let countdownEpoch = 0;
  let turnCountdown = 30;

  const maybeClearResolving = () => {
    if (!isResolvingTurn) return;
    if (resolvingTurnNumber === null || resolvingEpoch === null) return;
    if (turn > resolvingTurnNumber && countdownEpoch > resolvingEpoch) {
      isResolvingTurn = false;
      resolvingTurnNumber = null;
      resolvingEpoch = null;
    }
  };

  function startCountdown(nextCountdown = 30) {
    countdownEpoch += 1;
    turnCountdown = nextCountdown;
    maybeClearResolving();
  }

  function selectAction() {
    isResolvingTurn = true;
    resolvingTurnNumber = turn;
    resolvingEpoch = countdownEpoch;
  }

  function setTurn(nextTurn: number) {
    turn = nextTurn;
    maybeClearResolving();
  }

  function tickCountdown(nextCountdown: number) {
    turnCountdown = nextCountdown;
    maybeClearResolving();
  }

  function reset() {
    isResolvingTurn = false;
    resolvingTurnNumber = null;
    resolvingEpoch = null;
    turn = 1;
    countdownEpoch = 0;
    turnCountdown = 30;
  }

  return {
    startCountdown,
    selectAction,
    setTurn,
    tickCountdown,
    reset,
    get isResolvingTurn() { return isResolvingTurn; },
    get turn() { return turn; },
    get countdownEpoch() { return countdownEpoch; },
    get turnCountdown() { return turnCountdown; },
  };
}

test("initial state: isResolvingTurn is false", () => {
  const tracker = createResolvingTurnTracker();
  assert.equal(tracker.isResolvingTurn, false);
});

test("selecting action sets isResolvingTurn to true", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);
});

test("turn advances but epoch does not advance: keep resolving", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.setTurn(2);
  assert.equal(tracker.isResolvingTurn, true);
});

test("epoch advances but turn does not advance: keep resolving", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.startCountdown(30);
  assert.equal(tracker.isResolvingTurn, true);
});

test("turn and epoch both advance: clear resolving", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.setTurn(2);
  assert.equal(tracker.isResolvingTurn, true);
  tracker.startCountdown(30);
  assert.equal(tracker.isResolvingTurn, false);
});

test("stale high countdown value alone never clears resolving", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.setTurn(2);
  tracker.tickCountdown(30);
  assert.equal(tracker.isResolvingTurn, true);
});

test("paralysis window also clears on epoch+turn, not countdown seconds", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(3);
  tracker.selectAction();
  tracker.setTurn(2);
  assert.equal(tracker.isResolvingTurn, true);
  tracker.startCountdown(3);
  assert.equal(tracker.isResolvingTurn, false);
});

test("rapid multi-turn actions stay consistent", () => {
  const tracker = createResolvingTurnTracker();

  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.setTurn(2);
  tracker.startCountdown(30);
  assert.equal(tracker.isResolvingTurn, false);

  tracker.selectAction();
  tracker.setTurn(3);
  tracker.startCountdown(30);
  assert.equal(tracker.isResolvingTurn, false);

  tracker.selectAction();
  tracker.setTurn(4);
  tracker.startCountdown(30);
  assert.equal(tracker.isResolvingTurn, false);
});

test("reset clears resolving and epochs", () => {
  const tracker = createResolvingTurnTracker();
  tracker.startCountdown(30);
  tracker.selectAction();
  tracker.setTurn(2);
  tracker.startCountdown(30);
  tracker.selectAction();
  assert.equal(tracker.isResolvingTurn, true);

  tracker.reset();
  assert.equal(tracker.isResolvingTurn, false);
  assert.equal(tracker.turn, 1);
  assert.equal(tracker.countdownEpoch, 0);
  assert.equal(tracker.turnCountdown, 30);
});
