import test from "node:test";
import assert from "node:assert/strict";
import { safeImageUrl } from "./imageUrl";

test("safeImageUrl allows data URLs and root-relative static asset paths", () => {
  assert.equal(
    safeImageUrl("data:image/svg+xml;base64,abc"),
    "data:image/svg+xml;base64,abc",
  );
  assert.equal(safeImageUrl("/arttle_boss/boss1.png"), "/arttle_boss/boss1.png");
  assert.equal(safeImageUrl("/images/avatar.png"), "/images/avatar.png");
});

test("safeImageUrl rejects non-whitelisted URL schemes", () => {
  assert.equal(safeImageUrl("https://example.com/image.png"), "");
  assert.equal(safeImageUrl("javascript:alert(1)"), "");
});
