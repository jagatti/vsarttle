import assert from "node:assert/strict";
import test from "node:test";
import { loadSlots, persistSlots, SLOT_COUNT } from "@/lib/drawingSlots";
import type { DrawingData } from "@/types/game";

const sampleDrawing: DrawingData = {
  version: 1,
  canvas: { width: 400, height: 400 },
  layers: [
    {
      id: "base",
      name: "base",
      strokes: [
        {
          id: "s1",
          tool: "pen",
          color: "#ff0000",
          size: 8,
          points: [
            { x: 10, y: 10, t: 0 },
            { x: 20, y: 20, t: 1 },
          ],
        },
      ],
    },
  ],
};

// Minimal localStorage mock for Node.js test environment
function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

// Patch global window + localStorage for tests
function setupEnv() {
  const ls = makeLocalStorageMock();
  // @ts-expect-error — intentional global mock for tests
  globalThis.window = { localStorage: ls };
  // @ts-expect-error — intentional global mock for tests
  globalThis.localStorage = ls;
  return ls;
}

test("loadSlots returns SLOT_COUNT null entries when storage is empty", () => {
  setupEnv();
  const slots = loadSlots();
  assert.equal(slots.length, SLOT_COUNT);
  assert.ok(slots.every((s) => s === null));
});

test("persistSlots and loadSlots round-trip correctly", () => {
  setupEnv();
  const slot = { drawingData: sampleDrawing, thumbnail: "data:image/jpeg;base64,abc", equippedSkillId: "tieBoost" as const };
  const toSave: (typeof slot | null)[] = [slot, slot, null];
  persistSlots(toSave);
  const loaded = loadSlots();
  assert.equal(loaded.length, SLOT_COUNT);
  assert.deepEqual(loaded[0]?.drawingData, sampleDrawing);
  assert.equal(loaded[0]?.thumbnail, "data:image/jpeg;base64,abc");
  assert.equal(loaded[0]?.equippedSkillId, "tieBoost");
  assert.equal(loaded[1]?.equippedSkillId, "tieBoost");
  assert.deepEqual(loaded[1]?.drawingData, sampleDrawing);
  assert.equal(loaded[2], null);
});

test("persistSlots can clear an equipped skill without changing its drawing", () => {
  setupEnv();
  const slot = { drawingData: sampleDrawing, thumbnail: "data:image/jpeg;base64,clear", equippedSkillId: null };
  persistSlots([slot, null, null]);
  const loaded = loadSlots();
  assert.deepEqual(loaded[0]?.drawingData, sampleDrawing);
  assert.equal(loaded[0]?.equippedSkillId, null);
});

test("loadSlots returns nulls for malformed localStorage data", () => {
  const ls = setupEnv();
  ls.setItem("arttle_drawing_slots", "{not an array}");
  const slots = loadSlots();
  assert.ok(slots.every((s) => s === null));
});

test("loadSlots pads short arrays to SLOT_COUNT", () => {
  const ls = setupEnv();
  const slot = { drawingData: sampleDrawing, thumbnail: "data:image/jpeg;base64,x" };
  ls.setItem("arttle_drawing_slots", JSON.stringify([slot]));
  const slots = loadSlots();
  assert.equal(slots.length, SLOT_COUNT);
  assert.ok(slots[0] !== null);
  assert.equal(slots[0]?.equippedSkillId, null);
  assert.equal(slots[1], null);
  assert.equal(slots[2], null);
});

test("loadSlots treats missing or invalid equipped skills as unequipped", () => {
  const ls = setupEnv();
  const legacySlot = { drawingData: sampleDrawing, thumbnail: "data:image/jpeg;base64,legacy" };
  const invalidSlot = { ...legacySlot, equippedSkillId: "not-a-skill" };
  ls.setItem("arttle_drawing_slots", JSON.stringify([legacySlot, invalidSlot]));
  const slots = loadSlots();
  assert.equal(slots[0]?.equippedSkillId, null);
  assert.equal(slots[1]?.equippedSkillId, null);
});

test("loadSlots rejects entries missing required fields", () => {
  const ls = setupEnv();
  ls.setItem("arttle_drawing_slots", JSON.stringify([{ bad: "data" }, null, null]));
  const slots = loadSlots();
  assert.equal(slots[0], null);
});
