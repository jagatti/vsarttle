"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DrawingData, Stroke } from "@/types/game";

const COLORS = ["#111111", "#ff3b30", "#ff9500", "#34c759", "#007aff", "#af52de", "#ffffff"];

const CANVAS_SIZE = 400;

export function DrawPanel(props: {
  seconds: number;
  disabled?: boolean;
  onComplete: (payload: { drawing: DrawingData; imageDataUrl: string; imageData: ImageData }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawingStroke, setDrawingStroke] = useState<Stroke | null>(null);
  const submittedRef = useRef(false);

  const drawingData = useMemo<DrawingData>(
    () => ({
      version: 1,
      canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
      layers: [{ id: "base", name: "base", strokes }],
    }),
    [strokes],
  );

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
  }, [strokes, drawingStroke]);

  const startStroke = (x: number, y: number) => {
    if (props.disabled) return;
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
    props.onComplete({ drawing: drawingData, imageDataUrl: canvas.toDataURL("image/png"), imageData: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
  }, [drawingData, props]);

  useEffect(() => {
    if (props.seconds <= 0) submit();
  }, [props.seconds, submit]);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-xl font-bold">おえかき（残り {props.seconds} 秒）</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded border px-2 py-1" onClick={() => setTool("pen")}>ペン</button>
        <button className="rounded border px-2 py-1" onClick={() => setTool("eraser")}>消しゴム</button>
        <button className="rounded border px-2 py-1" onClick={() => setStrokes([])}>全消去</button>
        <label className="flex items-center gap-1">太さ<input type="range" min={1} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((preset) => (
          <button key={preset} aria-label={preset} className="h-7 w-7 rounded border" style={{ backgroundColor: preset }} onClick={() => setColor(preset)} />
        ))}
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="w-full max-w-[400px] touch-none rounded border bg-white"
        onPointerDown={(e) => {
          const p = pointerPos(e);
          startStroke(p.x, p.y);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawingStroke) return;
          const p = pointerPos(e);
          appendPoint(p.x, p.y);
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={submit}>完成</button>
    </section>
  );
}
