import assert from "node:assert/strict";
import test from "node:test";

import {
  getVoidminationCutInOverlayStyle,
  getVoidminationTooltipEvasionDisplay,
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
