import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BGM_VOLUME, DEFAULT_SE_VOLUME } from "@/lib/soundManager";

test("default sound volumes match updated title options defaults", () => {
  assert.equal(DEFAULT_BGM_VOLUME, 0.08);
  assert.equal(DEFAULT_SE_VOLUME, 0.12);
});
