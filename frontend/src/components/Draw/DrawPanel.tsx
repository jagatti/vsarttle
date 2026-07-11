"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CharacterStats, DrawingData, Stroke, WireDrawingData } from "@/types/game";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
import { wireDrawingToStrokes } from "@/lib/drawingWire";
import { soundManager } from "@/lib/soundManager";

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

const TYPE_LABELS: Record<string, string> = {
  attack: "こうげき型",
  magic: "まほう型",
  defense: "ぼうぎょ型",
  balanced: "バランス型",
};

const TYPE_COLORS: Record<string, string> = {
  attack: "#ef4444",
  magic: "#8b5cf6",
  defense: "#f59e0b",
  balanced: "#6b7280",
};

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

export function DrawPanel(props: {
  seconds: number;
  disabled?: boolean;
  /** Previously submitted drawing to continue editing (e.g. 「描きなおしてもう１戦」). */
  initialDrawing?: WireDrawingData;
  onComplete: (payload: { drawing: DrawingData; imageData: ImageData }) => void;
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

  const [liveStats, setLiveStats] = useState<CharacterStats | null>(null);
  const [liveType, setLiveType] = useState<string>("balanced");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

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
      ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Calculate live stats after rendering
    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const stats = calculateStatsFromDrawing(drawingData, imageData);
    const type = detectCharacterType(imageData);
    setLiveStats(stats);
    setLiveType(type);
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

  const submit = useCallback(() => {
    if (submittedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    submittedRef.current = true;
    setSubmitted(true);
    props.onComplete({ drawing: drawingData, imageData: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
  }, [drawingData, props]);

  useEffect(() => {
    if (props.seconds <= 0) submit();
  }, [props.seconds, submit]);

  const clearAll = () => {
    if (strokes.length === 0) return;
    if (!window.confirm("キャンバスの絵を全て消去します。よろしいですか？")) return;
    pushHistory();
    setStrokes([]);
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-xl font-bold">おえかき（残り {props.seconds} 秒）</h2>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "pen", label: "ペン" },
            { key: "eraser", label: "消しゴム" },
            { key: "fill", label: "塗りつぶし" },
          ] as const
        ).map(({ key, label }) => {
          const isSelected = tool === key;
          return (
            <button
              key={key}
              aria-pressed={isSelected}
              className="rounded-md px-3 py-1.5 text-sm font-bold transition-all"
              style={{
                border: isSelected ? "2px solid #2563eb" : "2px solid #d1d5db",
                background: isSelected ? "#2563eb" : "#ffffff",
                color: isSelected ? "#ffffff" : "#374151",
                boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.25)" : "none",
                transform: isSelected ? "scale(1.05)" : "scale(1)",
              }}
              onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); setTool(key); }}
              disabled={submitted}
            >
              {label}
            </button>
          );
        })}
        <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden />
        <button
          className="rounded-md border-2 border-gray-300 px-2 py-1.5 text-sm font-bold text-gray-500 disabled:opacity-30"
          onClick={undo}
          disabled={submitted || undoStack.length === 0}
          aria-label="元に戻す"
        >
          ↶ 元に戻す
        </button>
        <button
          className="rounded-md border-2 border-gray-300 px-2 py-1.5 text-sm font-bold text-gray-500 disabled:opacity-30"
          onClick={redo}
          disabled={submitted || redoStack.length === 0}
          aria-label="やり直す"
        >
          ↷ やり直す
        </button>
        <span className="mx-1 h-6 w-px bg-gray-300" aria-hidden />
        <button
          className="rounded-md border-2 border-red-400 bg-red-50 px-3 py-1.5 text-sm font-bold text-red-600"
          onClick={clearAll}
          disabled={submitted}
        >
          🗑 全消去
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-gray-600">太さ</span>
        {SIZE_PRESETS.map((preset) => {
          const isSelected = size === preset;
          return (
            <button
              key={preset}
              aria-label={`太さ ${preset}`}
              aria-pressed={isSelected}
              disabled={submitted}
              className="flex items-center justify-center rounded-md transition-all"
              style={{
                width: SIZE_SWATCH_BOX,
                height: SIZE_SWATCH_BOX,
                border: isSelected ? "2px solid #2563eb" : "2px solid #d1d5db",
                background: isSelected ? "#eff6ff" : "#ffffff",
                boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.25)" : "none",
              }}
              onClick={() => setSize(preset)}
            >
              <span
                style={{
                  width: preset,
                  height: preset,
                  borderRadius: "50%",
                  background: tool === "eraser" ? "#ffffff" : color,
                  border: tool === "eraser" ? "1px solid #9ca3af" : "none",
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((preset) => (
          <button
            key={preset}
            aria-label={preset}
            disabled={submitted}
            className="h-7 w-7 rounded border"
            style={{ backgroundColor: preset, outline: color === preset ? "2px solid #2563eb" : "none" }}
            onClick={() => setColor(preset)}
          />
        ))}
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={submitted} />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="w-full max-w-[400px] touch-none rounded border bg-white"
          style={{ pointerEvents: submitted ? "none" : "auto", opacity: submitted ? 0.7 : 1 }}
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
        <div className="w-full max-w-[240px] rounded border bg-gray-50 p-3 text-sm">
          <div className="mb-1 font-bold" style={{ color: TYPE_COLORS[liveType] }}>
            タイプ: {liveStats ? TYPE_LABELS[liveType] : "-"}
          </div>
          {liveStats && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span>HP: {liveStats.hp}</span>
              <span>PP: {liveStats.pp}</span>
              <span>攻撃: {liveStats.attack}</span>
              <span>防御: {liveStats.defense}</span>
              <span>速度: {liveStats.speed}</span>
              <span>回避: {Math.round(liveStats.evasion * 100)}%</span>
            </div>
          )}
        </div>
      </div>
      {submitted ? (
        <p className="rounded bg-yellow-50 p-3 text-sm font-bold text-yellow-800">相手の完成を待っています…</p>
      ) : (
        <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={() => { soundManager.playSe("/sounds/se/button.mp3"); submit(); }}>完成</button>
      )}
    </section>
  );
}
