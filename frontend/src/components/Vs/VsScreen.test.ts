import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarSummaryText } from "@/components/Vs/VsScreen";

test("buildRadarSummaryText returns highlighted stat text", () => {
  assert.equal(buildRadarSummaryText("attack"), "攻撃 が高い！");
  assert.equal(buildRadarSummaryText("defense"), "防御 が高い！");
});

test("buildRadarSummaryText returns balanced message when no emphasis", () => {
  assert.equal(buildRadarSummaryText(null), "バランスがいい");
});
