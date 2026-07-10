"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CharacterStats, DrawingData, Stroke } from "@/types/game";
import { calculateStatsFromDrawing, detectCharacterType } from "@/lib/statCalculator";
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
  onComplete: (payload: { drawing: DrawingData; imageData: ImageData }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser" | "fill">("pen");
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawingStroke, setDrawingStroke] = useState<Stroke | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);

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

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-xl font-bold">おえかき（残り {props.seconds} 秒）</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`rounded border px-2 py-1 ${tool === "pen" ? "bg-gray-200" : ""}`} onClick={() => setTool("pen")} disabled={submitted}>ペン</button>
        <button className={`rounded border px-2 py-1 ${tool === "eraser" ? "bg-gray-200" : ""}`} onClick={() => setTool("eraser")} disabled={submitted}>消しゴム</button>
        <button className={`rounded border px-2 py-1 ${tool === "fill" ? "bg-gray-200" : ""}`} onClick={() => setTool("fill")} disabled={submitted}>塗りつぶし</button>
        <button className="rounded border px-2 py-1" onClick={() => setStrokes([])} disabled={submitted}>全消去</button>
        <label className="flex items-center gap-1">太さ<input type="range" min={1} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={submitted} /></label>
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
