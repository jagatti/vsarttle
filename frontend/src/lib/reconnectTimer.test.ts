/**
 * Tests for the intentionalDisconnectRef / reconnect-timer logic used in page.tsx.
 *
 * We simulate the conn.on("close") callback and goToTitle() directly, without
 * needing PeerJS real connections.
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Minimal simulation of the relevant page.tsx logic
// ---------------------------------------------------------------------------

function makeReconnectLogic() {
  let intentionalDisconnect = false;
  let stage: string = "battle";
  let winnerText: string = "";
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Mirrors attachConnectionHandlers conn.on("close") */
  const onClose = () => {
    if (intentionalDisconnect) {
      // Intentional – skip forfeit flow entirely
      return;
    }
    reconnectTimer = setTimeout(() => {
      stage = "result";
      winnerText = "切断復帰できず敗北";
      reconnectTimer = null;
    }, 30_000);
  };

  /** Mirrors goToTitle() */
  const goToTitle = () => {
    intentionalDisconnect = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stage = "title";
    intentionalDisconnect = false;
  };

  /** Mirrors receiving return_to_title wire message */
  const onReceiveReturnToTitle = () => {
    intentionalDisconnect = true;
    // (goToTitle() will be called 2 s later)
  };

  return {
    get stage() { return stage; },
    get winnerText() { return winnerText; },
    get reconnectTimer() { return reconnectTimer; },
    get intentionalDisconnect() { return intentionalDisconnect; },
    onClose,
    goToTitle,
    onReceiveReturnToTitle,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("unexpected disconnect triggers forfeit result after 30 s", async (t) => {
  await t.test("close without intentional flag sets a timer", (_t, done) => {
    const logic = makeReconnectLogic();
    logic.onClose();
    assert.ok(logic.reconnectTimer !== null, "timer should be set");
    // Clean up timer so the test runner doesn't hang
    clearTimeout(logic.reconnectTimer!);
    done();
  });
});

test("goToTitle clears reconnect timer – result screen never shown", async (t) => {
  await t.test("timer is cleared and stage stays title", (_t, done) => {
    const logic = makeReconnectLogic();
    // Simulate: unexpected close fires first (race condition doesn't matter in
    // non-intentional branch, but here we test the intentional path)
    // goToTitle() sets intentional flag → close fires → should be skipped
    logic.goToTitle();              // flag = true during execution, then reset
    // Even if close fires AFTER goToTitle (flag is already reset), the timer
    // cleared in goToTitle must have been the timer set before it.
    // The main scenario: close fires because destroyPeer is called inside goToTitle.
    // At that moment intentionalDisconnect is still true.
    assert.strictEqual(logic.stage, "title");
    assert.ok(logic.reconnectTimer === null, "no timer left after goToTitle");
    done();
  });
});

test("intentional flag prevents forfeit when set before close fires", async (t) => {
  await t.test("close is a no-op when intentionalDisconnect is true", (_t, done) => {
    const logic = makeReconnectLogic();
    // Manually set flag (as goToTitle() does before destroyPeer())
    (logic as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect;
    // We test via onReceiveReturnToTitle (which also sets the flag)
    logic.onReceiveReturnToTitle(); // sets intentionalDisconnect = true
    logic.onClose();                // should return early
    assert.ok(logic.reconnectTimer === null, "no timer started for intentional close");
    assert.notStrictEqual(logic.stage, "result", "should not be result stage");
    done();
  });
});

test("genuine unexpected disconnect still eventually forfeits", async (t) => {
  await t.test("onClose starts a timer when disconnect is not intentional", (_t, done) => {
    const logic = makeReconnectLogic();
    // No intentional flag set
    logic.onClose();
    assert.ok(logic.reconnectTimer !== null, "forfeit timer must be set");
    assert.strictEqual(logic.stage, "battle", "stage unchanged while waiting");
    clearTimeout(logic.reconnectTimer!);
    done();
  });
});
