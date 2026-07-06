import type { DrawingData, WireDrawingData, WirePoint } from "@/types/game";

const MIN_POINT_DISTANCE = 1.5;

const roundCoordinate = (value: number) => Math.round(value);

const distance = (a: WirePoint, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function simplifyPoints(points: Array<{ x: number; y: number }>): WirePoint[] {
  if (points.length <= 2) {
    return points.map(({ x, y }) => ({ x: roundCoordinate(x), y: roundCoordinate(y) }));
  }

  const simplified: WirePoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const rounded = { x: roundCoordinate(point.x), y: roundCoordinate(point.y) };
    const isEdgePoint = index === 0 || index === points.length - 1;
    const lastKept = simplified[simplified.length - 1];

    if (isEdgePoint || !lastKept || distance(lastKept, rounded) >= MIN_POINT_DISTANCE) {
      simplified.push(rounded);
    }
  }

  return simplified;
}

export function prepareDrawingForWire(drawing: DrawingData): WireDrawingData {
  return {
    version: drawing.version,
    canvas: drawing.canvas,
    layers: drawing.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      strokes: layer.strokes.map((stroke) => ({
        id: stroke.id,
        tool: stroke.tool,
        color: stroke.color,
        size: roundCoordinate(stroke.size),
        points: simplifyPoints(stroke.points),
      })),
    })),
  };
}

export function drawingToDataUrl(drawing: WireDrawingData): string {
  const strokeMarkup = drawing.layers
    .flatMap((layer) =>
      layer.strokes
        .filter((stroke) => stroke.points.length > 1)
        .map((stroke) => {
          const points = stroke.points.map((point) => `${point.x},${point.y}`).join(" ");
          const color = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
          return `<polyline fill="none" stroke="${escapeXml(color)}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round" points="${points}" />`;
        }),
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.canvas.width} ${drawing.canvas.height}" width="${drawing.canvas.width}" height="${drawing.canvas.height}"><rect width="100%" height="100%" fill="#ffffff" />${strokeMarkup}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
