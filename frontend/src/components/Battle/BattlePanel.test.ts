import assert from "node:assert/strict";
import test from "node:test";

import type { TurnResult } from "@/types/game";
import {
  getVoidminationCutInOverlayStyle,
  getVoidminationTooltipEvasionDisplay,
  shouldResetBattlePanelTransientState,
  VOIDMINATION_CUT_IN_DURATION_MS,
} from "@/components/Battle/BattlePanel";

test("voidmination cut-in duration is 3900ms", () => {
  assert.equal(VOIDMINATION_CUT_IN_DURATION_MS, 3900);
});

test("voidmination cut-in overlay is constrained to the battle panel", () => {
  const style = getVoidminationCutInOverlayStyle();
  assert.equal(style.position, "absolute");
  assert.equal(style.inset, 0);
  assert.equal(style.backgroundSize, "cover");
  assert.equal(style.backgroundPosition, "center");
});

test("voidmination tooltip evade display is forced to red 0%", () => {
  assert.deepEqual(getVoidminationTooltipEvasionDisplay(0.37, true), {
    color: "#ef4444",
    text: "0%",
  });
});

test("normal tooltip evade display keeps the real rate and existing color", () => {
  assert.deepEqual(getVoidminationTooltipEvasionDisplay(0.126, false), {
    color: "#c4b5fd",
    text: "13%",
  });
});

test("battle panel transient state resets for a fresh rematch battle", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, null, false, false), true);
});

test("battle panel transient state does not reset during an active voidmination battle", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, null, true, false), false);
});

test("battle panel transient state does not reset while turn animation result is present", () => {
  assert.equal(shouldResetBattlePanelTransientState(1, { turn: 1 } as TurnResult, false, false), false);
});
