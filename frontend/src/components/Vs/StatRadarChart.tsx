"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  RADIUS_MAX,
  RADIUS_MIN,
  buildRadarPolygonPoints,
  buildRadarVertices,
  type RadarAdvantage,
  type RadarStatKey,
} from "@/components/Vs/statRadar";
import type { CharacterStats } from "@/types/game";

interface StatRadarChartProps {
  stats: CharacterStats;
  color: string;
  opponentStats?: CharacterStats;
  opponentColor?: string;
  emphasizeKey?: RadarStatKey | null;
  advantages?: Record<RadarStatKey, RadarAdvantage>;
  size?: number;
  animate?: boolean;
  side?: "left" | "right";
}

const GRID_RADII = [RADIUS_MIN, (RADIUS_MIN + RADIUS_MAX) / 2, RADIUS_MAX] as const;
const RADAR_AXIS_COUNT = 6;

function buildGridVertices(outerRadius: number, centerX: number, centerY: number, normalizedRadius: number) {
  return Array.from({ length: RADAR_AXIS_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / RADAR_AXIS_COUNT;
    const px = normalizedRadius * outerRadius;
    return {
      x: centerX + Math.cos(angle) * px,
      y: centerY + Math.sin(angle) * px,
    };
  });
}

export function StatRadarChart({
  stats,
  color,
  opponentStats,
  opponentColor,
  emphasizeKey = null,
  advantages,
  size = 220,
  animate = true,
  side = "left",
}: StatRadarChartProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [expanded, setExpanded] = useState(!animate);
  const padding = 42;
  const outerRadius = Math.max(28, size / 2 - padding);
  const center = size / 2;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!animate || reducedMotion) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
    const frame = window.requestAnimationFrame(() => setExpanded(true));
    return () => window.cancelAnimationFrame(frame);
  }, [animate, reducedMotion, stats, opponentStats]);

  const vertices = useMemo(() => buildRadarVertices(stats, outerRadius, center, center), [center, outerRadius, stats]);
  const opponentVertices = useMemo(
    () => (opponentStats ? buildRadarVertices(opponentStats, outerRadius, center, center) : null),
    [center, opponentStats, outerRadius],
  );

  const polygonPoints = useMemo(() => buildRadarPolygonPoints(vertices), [vertices]);
  const opponentPolygonPoints = useMemo(
    () => (opponentVertices ? buildRadarPolygonPoints(opponentVertices) : null),
    [opponentVertices],
  );

  const accessibleSummary = useMemo(
    () => vertices.map((vertex) => `${vertex.label} ${vertex.value}`).join("、"),
    [vertices],
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      data-side={side}
      style={{ width: size, height: size, overflow: "visible" }}
    >
      <title id={titleId}>ステータス比較レーダーチャート</title>
      <desc id={descId}>{accessibleSummary}</desc>
      {GRID_RADII.map((radius, index) => {
        const ringVertices = buildGridVertices(outerRadius, center, center, radius);
        return (
          <polygon
            key={index}
            points={buildRadarPolygonPoints(ringVertices)}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
        );
      })}
      {vertices.map((vertex) => (
        <line
          key={vertex.key}
          x1={center}
          y1={center}
          x2={center + Math.cos(vertex.angle) * outerRadius}
          y2={center + Math.sin(vertex.angle) * outerRadius}
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={1}
        />
      ))}
      {opponentPolygonPoints ? (
        <polygon
          points={opponentPolygonPoints}
          fill="none"
          stroke={opponentColor ?? "rgba(255,255,255,0.72)"}
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ) : null}
      <g
        style={{
          transformOrigin: `${center}px ${center}px`,
          transform: expanded ? "scale(1)" : "scale(0)",
          transition: animate && !reducedMotion ? "transform 500ms ease-out" : "none",
        }}
      >
        <polygon
          points={polygonPoints}
          fill={`${color}55`}
          stroke={color}
          strokeWidth={2.5}
          style={{ filter: `drop-shadow(0 6px 14px ${color}55)` }}
        />
        {vertices.map((vertex) => {
          const highlight = vertex.key === emphasizeKey;
          const labelDistance = outerRadius + 26;
          const labelX = center + Math.cos(vertex.angle) * labelDistance;
          const labelY = center + Math.sin(vertex.angle) * labelDistance;
          const textAnchor =
            Math.abs(Math.cos(vertex.angle)) < 0.2 ? "middle" : Math.cos(vertex.angle) > 0 ? "start" : "end";
          const advantage = advantages?.[vertex.key] ?? "even";
          const marker = advantage === "up" ? "▲" : advantage === "down" ? "▼" : "";
          const markerColor = advantage === "up" ? color : withAlpha(opponentColor ?? "#cbd5e1", "bb");
          const label = highlight ? `${vertex.label} ◎` : vertex.label;
          return (
            <g key={vertex.key}>
              <circle
                cx={vertex.x}
                cy={vertex.y}
                r={highlight ? 5.6 : 3.5}
                fill="#f8fafc"
                stroke={color}
                strokeWidth={highlight ? 3.4 : 2}
                style={highlight ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                dominantBaseline="central"
                fontSize={12}
                fontWeight={highlight ? 900 : 700}
                fill="#fff7ed"
                style={highlight ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
              >
                {label}
                {marker ? (
                  <tspan fill={markerColor} fontWeight={900}>{` ${marker}`}</tspan>
                ) : null}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function withAlpha(color: string, alphaHex: string) {
  if (!color.startsWith("#")) {
    return color;
  }
  if (color.length === 7) {
    return `${color}${alphaHex}`;
  }
  return color;
}
