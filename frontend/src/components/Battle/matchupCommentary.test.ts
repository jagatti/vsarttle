import assert from "node:assert/strict";
import test from "node:test";

import { getMatchupCommentary } from "@/components/Battle/matchupCommentary";

test("attack beats barrier from the attacker's point of view", () => {
  const commentary = getMatchupCommentary("attack", "barrier");
  assert.equal(commentary.tone, "win");
  assert.match(commentary.detail, /こうげきはバリアに強い/);
});

test("barrier reflects magic", () => {
  assert.equal(getMatchupCommentary("barrier", "magicStrong").tone, "win");
  assert.equal(getMatchupCommentary("magicWeak", "barrier").tone, "lose");
});

test("magic beats attack", () => {
  assert.equal(getMatchupCommentary("magicWeak", "attack").tone, "win");
  assert.equal(getMatchupCommentary("attack", "magicStrong").tone, "lose");
});

test("same category is a clash decided by speed", () => {
  const commentary = getMatchupCommentary("attack", "attack");
  assert.equal(commentary.tone, "clash");
  assert.match(commentary.detail, /はやさ/);
});

test("weak and strong magic are the same category", () => {
  assert.equal(getMatchupCommentary("magicWeak", "magicStrong").tone, "clash");
});

test("barrier counters a charging opponent", () => {
  assert.equal(getMatchupCommentary("barrier", "charge").tone, "win");
  assert.equal(getMatchupCommentary("charge", "barrier").tone, "lose");
});

test("charging against an attack leaves the charger exposed", () => {
  assert.equal(getMatchupCommentary("charge", "attack").tone, "lose");
  assert.equal(getMatchupCommentary("attack", "charge").tone, "win");
});

test("paralysis is called out for whoever is paralyzed", () => {
  assert.equal(getMatchupCommentary("paralysis", "attack").tone, "lose");
  assert.equal(getMatchupCommentary("attack", "paralysis").tone, "win");
});
