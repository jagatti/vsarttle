"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DrawingData, Stroke, WireDrawingData } from "@/types/game";
import { wireDrawingToStrokes } from "@/lib/drawingWire";
import { soundManager } from "@/lib/soundManager";
import { createThumbnail, loadSlots, persistSlots, SLOT_COUNT } from "@/lib/drawingSlots";
import type { DrawingSlot } from "@/lib/drawingSlots";
import type { EquippableSkillId } from "@/lib/roguelikeSkills";

const COLORS = [
  "#111111",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#8b5a2b",
  "#8e8e93",
];

const CANVAS_SIZE = 400;

const SIZE_PRESETS = [3, 8, 14, 22, 32];
const SIZE_SWATCH_BOX = 36;

function floodFillMask(imageData: { data: Uint8ClampedArray; width: number; height: number }, startX: number, startY: number, tolerance = 32): Uint8Array {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const startIdx = (startY * width + startX) * 4;
  const startColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
  const match = (i: number) =>
    Math.abs(data[i] - startColor[0]) <= tolerance &&
    Math.abs(data[i + 1] - startColor[1]) <= tolerance &&
    Math.abs(data[i + 2] - startColor[2]) <= tolerance &&
    Math.abs(data[i + 3] - startColor[3]) <= tolerance;

  const stack: number[] = [startY * width + startX];
  mask[startY * width + startX] = 1;
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p / width) | 0;
    const neighbors: Array<[number, number]> = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const np = ny * width + nx;
      if (mask[np]) continue;
      const ni = np * 4;
      if (!match(ni)) continue;
      mask[np] = 1;
      stack.push(np);
    }
  }
  return mask;
}

function maskToSpans(mask: Uint8Array, width: number, height: number) {
  const spans: { y: number; x1: number; x2: number }[] = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (mask[y * width + x]) {
        const start = x;
        while (x < width && mask[y * width + x]) x += 1;
        spans.push({ y, x1: start, x2: x - 1 });
      } else {
        x += 1;
      }
    }
  }
  return spans;
}

// Renders the given strokes onto an OFFSCREEN, TRANSPARENT canvas (no white
// background fill) and returns the resulting ImageData. This is used
// exclusively for stat/type calculation, as opposed to the visible canvas
// which always fills an opaque white background for the user to draw on.
//
// Why this matters: the visible canvas fills the entire 400x400 area with
// fully-opaque white before drawing strokes. If that same ImageData were fed
// into calculateStatsFromDrawing/detectCharacterType, every single pixel
// (including all the untouched white background) would count as a "filled"
// pixel with low saturation, which the trend detector buckets into the
// "defense" (barrier) type. The practical effect was that a blank or
// barely-touched canvas would still register ~100% coverage and get pushed
// toward a high-HP defense character, regardless of what (if anything) was
function drawCheckerboard(ctx: CanvasRenderingContext2D, cellSize: number) {
  for (let row = 0; row < CANVAS_SIZE / cellSize; row++) {
    for (let col = 0; col < CANVAS_SIZE / cellSize; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#ffffff" : "#e5e5e5";
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
}

// actually drawn. By computing stats from a transparent-background render
// instead, only pixels the player actually painted count as "filled", so an
// empty canvas correctly yields near-zero coverage/effort (and a neutral
// "balanced" type) instead of an artificial defense/HP-400 result.
function renderStrokesForStats(strokes: Stroke[]): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Intentionally do NOT fill a background color here — leave it transparent
  // so untouched areas have alpha 0 and are excluded from stat calculations.
  for (const stroke of strokes) {
    if (stroke.tool === "fill" && stroke.fillSpans) {
      ctx.save();
      ctx.fillStyle = stroke.color;
      for (const span of stroke.fillSpans) {
        ctx.fillRect(span.x1, span.y, span.x2 - span.x1 + 1, 1);
      }
      ctx.restore();
      continue;
    }
    if (stroke.points.length < 2) continue;
    ctx.save();
    // Eraser strokes should punch actual transparency into the stats canvas
    // (matching how they visually clear ink on the real white canvas),
    // rather than painting an opaque white blob that would be misread as an
    // intentional white-ink stroke.
    if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = stroke.tool === "eraser" ? "#000000" : stroke.color;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  return ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

export function DrawPanel(props: {
  seconds: number;
  disabled?: boolean;
  /** Previously submitted drawing to continue editing (e.g. 「描きなおしてもう１戦」). */
  initialDrawing?: WireDrawingData;
  onComplete: (payload: { drawing: DrawingData; imageData: ImageData; equippedSkillId: EquippableSkillId | null }) => void;
  /** When true, hides the countdown timer display and disables auto-submit on timer expiry. */
  noTimer?: boolean;
  /** Optional submit label for specialized drawing flows. */
  completeLabel?: string;
  /**
   * When provided, a "セット" button is shown (instead of the normal "完成" button) that
   * captures the current drawing without marking it as submitted, allowing the user to keep
   * drawing after capturing. Used in single-play mode for building a party of characters.
   */
  onSet?: (payload: { drawing: DrawingData; imageData: ImageData; equippedSkillId: EquippableSkillId | null }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser" | "fill">("pen");
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState<Stroke[]>(() =>
    props.initialDrawing ? wireDrawingToStrokes(props.initialDrawing) : [],
  );
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [drawingStroke, setDrawingStroke] = useState<Stroke | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  const [loadedEquippedSkillId, setLoadedEquippedSkillId] = useState<EquippableSkillId | null>(null);

  // Push the current strokes onto the undo history before applying a mutation, and
  // clear the redo history since a new action invalidates any previously undone state.
  const pushHistory = () => {
    setUndoStack((prev) => [...prev, strokes]);
    setRedoStack([]);
  };

  const undo = () => {
    if (submitted || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((prev) => [...prev, strokes]);
    setStrokes(previous);
  };

  const redo = () => {
    if (submitted || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((prev) => [...prev, strokes]);
    setStrokes(next);
  };

  const drawingData = useMemo<DrawingData>(
    () => ({
      version: 1,
      canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
      layers: [{ id: "base", name: "base", strokes }],
    }),
    [strokes],
  );

  // ── Save Slots ────────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<(DrawingSlot | null)[]>(() => loadSlots());

  const saveToSlot = (index: number) => {
    if (submitted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const existing = slots[index];
    if (existing !== null) {
      if (!window.confirm(`スロット ${index + 1} に上書き保存します。よろしいですか？`)) return;
    }

    soundManager.playSe("/sounds/se/button.mp3");
    const thumbnail = createThumbnail(canvas);
    const newSlot: DrawingSlot = { drawingData, thumbnail, equippedSkillId: existing?.equippedSkillId ?? null };
    const updated = slots.map((s, i) => (i === index ? newSlot : s));
    setSlots(updated);
    persistSlots(updated);
  };

  const loadFromSlot = (index: number) => {
    if (submitted) return;
    const slot = slots[index];
    if (!slot) return;

    if (strokes.length > 0) {
      if (!window.confirm(`スロット ${index + 1} の絵を読み込みます。現在の描画は失われます。よろしいですか？`)) return;
    }

    soundManager.playSe("/sounds/se/button.mp3");
    const loaded = wireDrawingToStrokes({
      version: slot.drawingData.version,
      canvas: slot.drawingData.canvas,
      layers: slot.drawingData.layers,
    });
    setStrokes(loaded);
    setLoadedEquippedSkillId(slot.equippedSkillId ?? null);
    setUndoStack([]);
    setRedoStack([]);
  };
  // ── End Save Slots ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawCheckerboard(ctx, 20);

    const allStrokes = drawingStroke ? [...strokes, drawingStroke] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.tool === "fill" && stroke.fillSpans) {
        ctx.save();
        ctx.fillStyle = stroke.color;
        for (const span of stroke.fillSpans) {
          ctx.fillRect(span.x1, span.y, span.x2 - span.x1 + 1, 1);
        }
        ctx.restore();
        continue;
      }
      if (stroke.points.length < 2) continue;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke.size;
      if (stroke.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.strokeStyle = stroke.color;
      }
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

  }, [strokes, drawingStroke, drawingData]);

  const startStroke = (x: number, y: number) => {
    if (props.disabled || submitted) return;
    if (tool === "fill") {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const ix = Math.max(0, Math.min(CANVAS_SIZE - 1, Math.round(x)));
      const iy = Math.max(0, Math.min(CANVAS_SIZE - 1, Math.round(y)));
      const mask = floodFillMask(imageData, ix, iy);
      const fillSpans = maskToSpans(mask, CANVAS_SIZE, CANVAS_SIZE);
      if (fillSpans.length === 0) return;
      pushHistory();
      setStrokes((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          tool: "fill",
          color,
          size: 0,
          points: [{ x: ix, y: iy, t: Date.now() }],
          fillSpans,
        },
      ]);
      return;
    }
    setDrawingStroke({
      id: crypto.randomUUID(),
      tool,
      color,
      size,
      points: [{ x, y, t: Date.now() }],
    });
  };

  const appendPoint = (x: number, y: number) => {
    setDrawingStroke((current) => (current ? { ...current, points: [...current.points, { x, y, t: Date.now() }] } : current));
  };

  const endStroke = () => {
    setDrawingStroke((current) => {
      if (current && current.points.length > 1) {
        pushHistory();
        setStrokes((prev) => [...prev, current]);
      }
      return null;
    });
  };

  const pointerPos = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const captureState = useCallback((): { drawing: DrawingData; imageData: ImageData; equippedSkillId: EquippableSkillId | null } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const statsImageData = renderStrokesForStats(strokes) ?? ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    return { drawing: drawingData, imageData: statsImageData, equippedSkillId: loadedEquippedSkillId };
  }, [drawingData, loadedEquippedSkillId, strokes]);

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    const state = captureState();
    if (!state) return;
    submittedRef.current = true;
    setSubmitted(true);
    // Use the transparent-background stats render (not the visible white
    // canvas) so the final stat calculation isn't skewed by the white
    // background — see renderStrokesForStats for details. Fall back to the
    // visible canvas's ImageData only if the offscreen render is unavailable.
    props.onComplete(state);
  }, [captureState, props]);

  useEffect(() => {
    if (!props.noTimer && props.seconds <= 0) submit();
  }, [props.noTimer, props.seconds, submit]);

  const clearAll = () => {
    if (strokes.length === 0) return;
    if (!window.confirm("キャンバスの絵を全て消去します。よろしいですか？")) return;
    pushHistory();
    setStrokes([]);
  };

  return (
    <section className="draw-panel space-y-3">
      {props.noTimer ? (
        <h2 className="text-xl font-bold">おえかき</h2>
      ) : (
        <h2 className="text-xl font-bold">おえかき（残り {props.seconds} 秒）</h2>
      )}
      <div className="draw-workspace">
      <div className="draw-toolbar" role="group" aria-label="描画ツール">
      <div className="draw-tools">
        {(
          [
            { key: "pen", label: "ペン", icon: "✏️" },
            { key: "fill", label: "塗りつぶし", icon: "🪣" },
            { key: "eraser", label: "消しゴム", icon: "🧽" },
          ] as const
        ).map(({ key, label, icon }) => {
          const isSelected = tool === key;
          return (
            <button
              key={key}
              aria-label={label}
              aria-pressed={isSelected}
              className="draw-tool rounded-md px-3 py-2 text-sm font-bold transition-all disabled:opacity-50"
              style={{
                border: isSelected ? "2px solid #4f46e5" : key === "fill" ? "2px solid #d97706" : "2px solid #c7d2fe",
                background: key === "fill" ? "#fef3c7" : isSelected ? "#e0e7ff" : "#ffffff",
                color: key === "fill" ? "#78350f" : "#312e81",
                boxShadow: isSelected ? "0 0 0 3px rgba(99,102,241,0.25), 0 3px 6px #312e8120" : "none",
              }}
              onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); setTool(key); }}
              disabled={submitted}
            >
              <span aria-hidden="true" className="text-xl">{icon}</span>
              <span>{label}</span>
              <span className="draw-tool-status">{isSelected ? "使用中" : ""}</span>
            </button>
          );
        })}
      </div>
      <div className="draw-history flex flex-wrap items-center gap-2">
        <button
          className="rounded-md border-2 border-indigo-200 bg-white px-2 py-2 text-sm font-bold text-indigo-900 disabled:opacity-30"
          onClick={undo}
          disabled={submitted || undoStack.length === 0}
          aria-label="元に戻す"
        >
          ↶ 元に戻す
        </button>
        <button
          className="rounded-md border-2 border-indigo-200 bg-white px-2 py-2 text-sm font-bold text-indigo-900 disabled:opacity-30"
          onClick={redo}
          disabled={submitted || redoStack.length === 0}
          aria-label="やり直す"
        >
          ↷ やり直す
        </button>
        <button
          className="rounded-md border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-30"
          onClick={clearAll}
          disabled={submitted}
        >
          🗑 全消去
        </button>
      </div>
      <div>
        <h3 className="mb-2 font-bold text-indigo-950">太さ <span className="text-sm">（{size}px）</span></h3>
        <div className="flex flex-wrap items-center gap-2">
        {SIZE_PRESETS.map((preset) => {
          const isSelected = size === preset;
          return (
            <button
              key={preset}
              aria-label={`太さ ${preset}px`}
              aria-pressed={isSelected}
              disabled={submitted}
              className="flex flex-col items-center justify-center rounded-md text-xs font-bold text-indigo-950 transition-all"
              style={{
                width: SIZE_SWATCH_BOX + 8,
                height: SIZE_SWATCH_BOX + 24,
                border: isSelected ? "2px solid #2563eb" : "2px solid #d1d5db",
                background: isSelected ? "#eff6ff" : "#ffffff",
                boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.25)" : "none",
              }}
              onClick={() => setSize(preset)}
            >
              <span
                className="flex items-center justify-center"
                style={{ width: SIZE_SWATCH_BOX, height: SIZE_SWATCH_BOX }}
              >
                <span style={{
                  width: preset, height: preset, borderRadius: "50%",
                  background: tool === "eraser" ? "#ffffff" : color,
                  border: "1px solid #9ca3af",
                }} />
              </span>
              <span>{preset}px</span>
            </button>
          );
        })}
        </div>
      </div>
      <div className="draw-pen-preview">
        <span className="font-bold">現在のペン</span>
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-indigo-200 bg-white">
            <span style={{ width: size, height: size, borderRadius: "50%", background: color, border: "1px solid #9ca3af" }} />
          </span>
          <span className="text-sm">{size}px <span className="block">{color}</span></span>
        </div>
      </div>
      <div>
      <h3 className="mb-2 font-bold text-indigo-950">色</h3>
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((preset) => (
          <button
            key={preset}
            aria-label={preset}
            aria-pressed={color === preset}
            disabled={submitted}
            className="h-7 w-7 rounded border"
            style={{ backgroundColor: preset, outline: color === preset ? "2px solid #2563eb" : "none" }}
            onClick={() => setColor(preset)}
          />
        ))}
        <input aria-label="好きな色を選ぶ" type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={submitted} />
      </div>
      </div>
      </div>
      <div className="draw-canvas-column">
      <p className="draw-hint" aria-live="polite">
        {tool === "fill" ? "🪣 タップした範囲を塗ります" : tool === "eraser" ? "🧽 なぞった部分を消します" : "✏️ 好きなキャラクターを描こう"}
      </p>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        aria-label="おえかきキャンバス"
        className="draw-canvas touch-none bg-white"
        style={{
          pointerEvents: submitted ? "none" : "auto", opacity: submitted ? 0.7 : 1,
          cursor: `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${
              tool === "fill"
                ? '<path d="M12 10l8-6 18 18-16 16L6 22z" fill="#fde68a" stroke="#312e81" stroke-width="2"/><path d="M12 10l14 14H8M38 28q-9 12 0 12t0-12" fill="#818cf8" stroke="#312e81" stroke-width="2"/>'
                : tool === "eraser"
                  ? `<rect x="${24 - size / 2}" y="${24 - size / 2}" width="${size}" height="${size}" fill="none" stroke="white" stroke-width="3"/><rect x="${24 - size / 2}" y="${24 - size / 2}" width="${size}" height="${size}" fill="none" stroke="#111" stroke-width="1"/>`
                  : `<circle cx="24" cy="24" r="${size / 2}" fill="none" stroke="white" stroke-width="3"/><circle cx="24" cy="24" r="${size / 2}" fill="none" stroke="#111" stroke-width="1"/>`
            }</svg>`
          )}") 24 24, crosshair`,
        }}
        onPointerDown={(e) => {
          if (submitted) return;
          const p = pointerPos(e);
          startStroke(p.x, p.y);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (submitted || !drawingStroke) return;
          const p = pointerPos(e);
          appendPoint(p.x, p.y);
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {props.onSet ? (
        <button
          className="draw-primary-action"
          disabled={submitted}
          onClick={() => {
            soundManager.playSe("/sounds/se/button.mp3");
            const state = captureState();
            if (state) props.onSet!(state);
          }}
        >
          セット
        </button>
      ) : submitted ? (
        <p className="rounded bg-yellow-50 p-3 text-sm font-bold text-yellow-800">相手の完成を待っています…</p>
      ) : (
        <button className="draw-primary-action" onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); submit(); }}>{props.completeLabel ?? "完成"}</button>
      )}
      {/* ── Save Slots ─────────────────────────────────────────────────── */}
      <div>
      <h3 className="mb-2 text-sm font-bold">保存スロット（絵をタップで読み込み）</h3>
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const slot = slots[i];
          const isDisabled = submitted;
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
              style={{ width: 100 }}
            >
              <div
                className="flex items-center justify-center overflow-hidden rounded-lg border-2 bg-white"
                style={{
                  width: 100,
                  height: 100,
                  borderColor: isDisabled ? "#d1d5db" : "#9ca3af",
                  cursor: slot && !isDisabled ? "pointer" : "default",
                  opacity: isDisabled ? 0.6 : 1,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}
                onClick={() => !isDisabled && slot && loadFromSlot(i)}
                title={slot && !isDisabled ? `スロット ${i + 1} を読み込む` : undefined}
              >
                {slot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.thumbnail}
                    alt={`スロット ${i + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <button
                    disabled={isDisabled}
                    className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold text-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      saveToSlot(i);
                    }}
                    title={`スロット ${i + 1} に保存`}
                  >
                    <span style={{ fontSize: 22 }}>💾</span>
                    保存
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                <span className="text-xs text-gray-500">{i + 1}</span>
                {slot && (
                  <button
                    disabled={isDisabled}
                    className="text-xs text-indigo-700 hover:underline disabled:opacity-40"
                    onClick={() => saveToSlot(i)}
                    title={`スロット ${i + 1} に上書き保存`}
                  >
                    上書き
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* ── End Save Slots ──────────────────────────────────────────────── */}
      </div>
      </div>
      </div>
    </section>
  );
}
