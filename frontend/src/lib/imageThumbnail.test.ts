import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailFromImageSource, isBlankThumbnail } from "@/lib/imageThumbnail";

function setupThumbnailEnv(options: {
  dataUrl: string;
  allTransparent: boolean;
  decodeReject?: boolean;
  hasDecode?: boolean;
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
        if (options.decodeReject) throw new Error("decode_failed");
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
    assert.equal(result, source);
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

