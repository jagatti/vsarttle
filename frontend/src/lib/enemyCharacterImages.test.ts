import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { getBossData, type Difficulty } from "@/data/bosses";
import { SEED_GHOSTS } from "@/data/seed-ghosts";
import { FALLBACK_CHARACTER_IMAGE_URL, resolveCharacterImageUrl } from "@/lib/imageUrl";
import { buildRoguelikeBossState } from "@/lib/roguelikeBoss";
import { isBossFloor, isWeakFloor, ROGUELIKE_TOTAL_FLOORS } from "@/lib/roguelikeEnemyStats";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

function assertVisibleCharacterImage(url: string, label: string) {
  const resolved = resolveCharacterImageUrl(url);
  assert.notEqual(resolved, FALLBACK_CHARACTER_IMAGE_URL, `${label}: image is missing/blank (${url})`);
  if (resolved.startsWith("/")) {
    const file = path.join(PUBLIC_DIR, resolved);
    assert.ok(existsSync(file), `${label}: ${resolved} does not exist in public/`);
    assert.ok(statSync(file).size > 0, `${label}: ${resolved} is empty`);
  }
}

test("every roguelike floor has an enemy with a visible image", () => {
  for (let floor = 1; floor <= ROGUELIKE_TOTAL_FLOORS; floor += 1) {
    assert.ok(isWeakFloor(floor) || isBossFloor(floor), `floor ${floor} has no enemy source`);
    if (isBossFloor(floor)) {
      assertVisibleCharacterImage(buildRoguelikeBossState(floor).imageDataUrl, `roguelike floor ${floor} boss`);
    }
  }
});

test("every seed ghost (weak-floor / ghost-match fallback enemy) has a visible image", () => {
  assert.ok(SEED_GHOSTS.length > 0);
  for (const ghost of SEED_GHOSTS) {
    assertVisibleCharacterImage(ghost.drawingThumbnail, `seed ghost ${ghost.seedId ?? ghost.nickname}`);
  }
});

test("every single-play boss has a visible image", () => {
  for (const difficulty of ["normal", "hard"] as Difficulty[]) {
    for (const floor of [1, 2, 3, 4, 5]) {
      assertVisibleCharacterImage(getBossData(floor, 1, difficulty).imageUrl, `${difficulty} boss ${floor}-1`);
    }
    assertVisibleCharacterImage(getBossData(5, 2, difficulty).imageUrl, `${difficulty} boss 5-2`);
  }
});
