import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailFromImageSource, isBlankThumbnail } from "@/lib/imageThumbnail";

function setupThumbnailEnv(options: {
  renderDataUrl: string;
  allTransparent: boolean;
  fallbackDataUrl?: string;
  decodeReject?: boolean;
  hasDecode?: boolean;
  /** When true, every decode() call rejects (used to test compressFallback path) */
  alwaysDecodeReject?: boolean;
}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;

  const canvases: Array<{
    width: number;
    height: number;
    fillStyle: string;
    fillRectCalls: Array<[number, number, number, number]>;
    drawImageCalls: number;
    toDataURLCalls: Array<{ type?: string; quality?: number }>;
  }> = [];

  // @ts-expect-error test-only browser mock
  globalThis.window = {};
  // @ts-expect-error test-only browser mock
  globalThis.document = {
    createElement: () => {
      const canvasState = {
        width: 0,
        height: 0,
        fillStyle: "",
        fillRectCalls: [] as Array<[number, number, number, number]>,
        drawImageCalls: 0,
        toDataURLCalls: [] as Array<{ type?: string; quality?: number }>,
      };
      const context = {
        clearRect: () => {},
        drawImage: () => {
          canvasState.drawImageCalls += 1;
        },
        fillRect: (x: number, y: number, width: number, height: number) => {
          canvasState.fillRectCalls.push([x, y, width, height]);
        },
        getImageData: () => {
          const alpha = options.allTransparent ? 0 : 255;
          return { data: new Uint8ClampedArray([0, 0, 0, alpha]) };
        },
        set fillStyle(value: string) {
          canvasState.fillStyle = value;
        },
        get fillStyle() {
          return canvasState.fillStyle;
        },
      };
      const canvas = {
        get width() {
          return canvasState.width;
        },
        set width(value: number) {
          canvasState.width = value;
        },
        get height() {
          return canvasState.height;
        },
        set height(value: number) {
          canvasState.height = value;
        },
        getContext: () => context,
        toDataURL: (type?: string, quality?: number) => {
          canvasState.toDataURLCalls.push({ type, quality });
          if (type === "image/jpeg") return options.fallbackDataUrl ?? options.renderDataUrl;
          return options.renderDataUrl;
        },
      };
      canvases.push(canvasState);
      return canvas;
    },
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

  return {
    canvases,
    restore: () => {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Image = previousImage;
    },
  };
}

test("isBlankThumbnail returns true for short data image URLs", () => {
  assert.equal(isBlankThumbnail("data:image/png;base64,abc"), true);
});

test("isBlankThumbnail returns false for non-data URLs", () => {
  assert.equal(isBlankThumbnail("/arttle_boss/boss1.png"), false);
});

test("createThumbnailFromImageSource returns PNG when decode and render succeed", async () => {
  const { restore } = setupThumbnailEnv({
    renderDataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
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
  const { restore } = setupThumbnailEnv({
    renderDataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    fallbackDataUrl: `data:image/jpeg;base64,${"A".repeat(1_000)}`,
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
  const { restore } = setupThumbnailEnv({
    renderDataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
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

test("createThumbnailFromImageSource keeps a short non-transparent PNG instead of falling back", async () => {
  const renderDataUrl = `data:image/png;base64,${"a".repeat(100)}`;
  const fallbackDataUrl = `data:image/jpeg;base64,${"A".repeat(1_000)}`;
  const { canvases, restore } = setupThumbnailEnv({
    renderDataUrl,
    fallbackDataUrl,
    allTransparent: false,
  });
  try {
    const result = await createThumbnailFromImageSource("data:image/svg+xml;base64,abc");
    assert.equal(result, renderDataUrl);
    assert.equal(canvases.length, 1);
  } finally {
    restore();
  }
});

test("compressFallback: returns valid placeholder (never truncated string) when all decode paths fail and source is oversized", async () => {
  // Source is a huge fake SVG data URL with a %XX sequence that would be
  // broken by mechanical truncation.
  const bigSource = "data:image/svg+xml;charset=UTF-8," + "%3Csvg%3E" + "x".repeat(300_000) + "%3E%2Fsvg%3E";
  const { restore } = setupThumbnailEnv({
    renderDataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
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

test("compressFallback fills a white background before JPEG export", async () => {
  const jpegDataUrl = `data:image/jpeg;base64,${"A".repeat(1_000)}`;
  const { canvases, restore } = setupThumbnailEnv({
    renderDataUrl: `data:image/png;base64,${"a".repeat(1_300)}`,
    fallbackDataUrl: jpegDataUrl,
    allTransparent: true, // renderThumbnail will return null → compressFallback path
  });
  try {
    const source = "data:image/svg+xml;base64,abc";
    const result = await createThumbnailFromImageSource(source);
    const fallbackCanvas = canvases[1];
    assert.equal(result, jpegDataUrl);
    assert.equal(fallbackCanvas.fillStyle, "#ffffff");
    assert.deepEqual(fallbackCanvas.fillRectCalls, [[0, 0, 64, 64]]);
    assert.equal(fallbackCanvas.drawImageCalls, 1);
    assert.deepEqual(fallbackCanvas.toDataURLCalls, [{ type: "image/jpeg", quality: 0.3 }]);
  } finally {
    restore();
  }
});
