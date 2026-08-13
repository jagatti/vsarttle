import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailFromImageSource, isBlankThumbnail } from "@/lib/imageThumbnail";

function setupThumbnailEnv(options: {
  dataUrl: string;
  allTransparent: boolean;
  decodeReject?: boolean;
  hasDecode?: boolean;
  /** When true, every decode() call rejects (used to test compressFallback path) */
  alwaysDecodeReject?: boolean;
}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;

  const context = {
    clearRect: () => {},
    drawImage: () => {},
    getImageData: () => {
      const alpha = options.allTransparent ? 0 : 255;
      return { data: new Uint8ClampedArray([0, 0, 0, alpha]) };
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => options.dataUrl,
  };

  // @ts-expect-error test-only browser mock
  globalThis.window = {};
  // @ts-expect-error test-only browser mock
  globalThis.document = {
    createElement: () => canvas,
  };

  class MockImage {
    src = "";
    complete = true;
    naturalWidth = 128;
    naturalHeight = 128;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decode?: () => Promise<void>;

    constructor() {
      if (options.hasDecode === false) return;
      this.decode = async () => {
        if (options.decodeReject || options.alwaysDecodeReject)
          throw new Error("decode_failed");
      };
    }
  }

  // @ts-expect-error test-only browser mock
  globalThis.Image = MockImage;

  return () => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
  };
}

test("isBlankThumbnail returns true for short data image URLs", () => {
  assert.equal(isBlankThumbnail("data:image/png;base64,abc"), true);
});

test("isBlankThumbnail returns false for non-data URLs", () => {
  assert.equal(isBlankThumbnail("/arttle_boss/boss1.png"), false);
});

test("createThumbnailFromImageSource returns PNG when decode and render succeed", async () => {
  const restore = setupThumbnailEnv({
    dataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    allTransparent: false,
  });
  try {
    const result = await createThumbnailFromImageSource("data:image/svg+xml;base64,abc");
    assert.equal(result.startsWith("data:image/png;base64,"), true);
  } finally {
    restore();
  }
});

test("createThumbnailFromImageSource falls back when canvas is fully transparent", async () => {
  const restore = setupThumbnailEnv({
    dataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    allTransparent: true,
  });
  try {
    const source = "data:image/svg+xml;base64,abc";
    const result = await createThumbnailFromImageSource(source);
    // renderThumbnail returns null (transparent), so compressFallback is called.
    // compressFallback now awaits decode() and re-encodes; the mock canvas returns
    // a valid data URL, so we should get back a valid image data URL.
    assert.ok(result.startsWith("data:image/"), `Expected valid data URL, got: ${result.slice(0, 80)}`);
  } finally {
    restore();
  }
});

test("createThumbnailFromImageSource falls back when decode fails", async () => {
  const restore = setupThumbnailEnv({
    dataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    allTransparent: false,
    decodeReject: true,
  });
  try {
    const source = "data:image/svg+xml;base64,abc";
    const result = await createThumbnailFromImageSource(source);
    assert.equal(result, source);
  } finally {
    restore();
  }
});


// ---- regression tests for compressFallback fix ----

test("compressFallback: returns valid placeholder (never truncated string) when all decode paths fail and source is oversized", async () => {
  // Source is a huge fake SVG data URL with a %XX sequence that would be
  // broken by mechanical truncation.
  const bigSource = "data:image/svg+xml;charset=UTF-8," + "%3Csvg%3E" + "x".repeat(300_000) + "%3E%2Fsvg%3E";
  const restore = setupThumbnailEnv({
    dataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    allTransparent: false,
    alwaysDecodeReject: true,
  });
  try {
    const result = await createThumbnailFromImageSource(bigSource);
    // Must be a valid data URL starting with "data:image/"
    assert.ok(result.startsWith("data:image/"), `Expected valid data URL, got: ${result.slice(0, 80)}`);
    // Must NOT be a raw truncation of the source (which would end mid-percent-encoding)
    assert.ok(!result.startsWith("data:image/svg+xml;charset=UTF-8,"), "Must not return a (possibly truncated) SVG source directly");
  } finally {
    restore();
  }
});

test("compressFallback: when compress succeeds (decode ok), returns JPEG within MAX_THUMBNAIL_BYTES", async () => {
  const jpegDataUrl = `data:image/jpeg;base64,${"A".repeat(1_000)}`;
  const restore = setupThumbnailEnv({
    dataUrl: jpegDataUrl,
    allTransparent: true, // renderThumbnail will return null → compressFallback path
  });
  try {
    const source = "data:image/svg+xml;base64,abc";
    const result = await createThumbnailFromImageSource(source);
    // compressFallback's canvas.toDataURL returns the jpegDataUrl which is small enough
    assert.ok(result.startsWith("data:image/"), `Expected valid data URL, got: ${result.slice(0, 80)}`);
    assert.ok(result.length <= 250_000, "Result must be within MAX_THUMBNAIL_BYTES");
  } finally {
    restore();
  }
});
