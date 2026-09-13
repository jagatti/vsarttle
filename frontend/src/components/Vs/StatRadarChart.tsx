"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  BASE_RADIUS,
  buildBaseRadarVertices,
  buildRadarPolygonPoints,
  buildRadarVertices,
  getMostDivergentRadarStatKey,
  type RadarBaseStats,
} from "@/components/Vs/statRadar";
import type { CharacterStats } from "@/types/game";

interface StatRadarChartProps {
  stats: CharacterStats;
  base: RadarBaseStats;
  color: string;
  size?: number;
  animate?: boolean;
  side?: "left" | "right";
}

const GRID_RADII = [0.35, BASE_RADIUS, 1];

function formatDelta(key: keyof RadarBaseStats, delta: number) {
  if (key === "evasion") {
    const pct = Math.round(delta * 100);
    if (pct === 0) return null;
    return `${pct > 0 ? "▲" : "▼"}${pct > 0 ? "+" : ""}${pct}%`;
  }
  if (delta === 0) return null;
  return `${delta > 0 ? "▲" : "▼"}${delta > 0 ? "+" : ""}${delta}`;
}

function formatAccessibleDelta(key: keyof RadarBaseStats, delta: number) {
  if (key === "evasion") {
    const pct = Math.round(delta * 100);
    return pct === 0 ? "差分なし" : pct > 0 ? `${pct}%高い` : `${Math.abs(pct)}%低い`;
  }
  return delta === 0 ? "差分なし" : delta > 0 ? `${delta}高い` : `${Math.abs(delta)}低い`;
}

export function StatRadarChart({
  stats,
  base,
  color,
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
  }, [animate, reducedMotion, stats]);

  const vertices = useMemo(
    () => buildRadarVertices(stats, base, outerRadius, center, center),
    [base, center, outerRadius, stats],
  );
  const baseVertices = useMemo(
    () => buildBaseRadarVertices(outerRadius, center, center),
    [center, outerRadius],
  );
  const highlightKey = useMemo(() => getMostDivergentRadarStatKey(stats, base), [base, stats]);
  const polygonPoints = useMemo(() => buildRadarPolygonPoints(vertices), [vertices]);
  const basePolygonPoints = useMemo(() => buildRadarPolygonPoints(baseVertices), [baseVertices]);
  const accessibleSummary = useMemo(
    () =>
      vertices
        .map((vertex) => `${vertex.label} ${vertex.value}（基準 ${vertex.baseValue}、${formatAccessibleDelta(vertex.key, vertex.delta)}）`)
        .join("、"),
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
        const ringVertices = buildBaseRadarVertices(outerRadius, center, center, radius);
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
      <polygon
        points={basePolygonPoints}
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
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
          const highlight = vertex.key === highlightKey;
          const deltaLabel = formatDelta(vertex.key, vertex.delta);
          const diffDistance = outerRadius * (vertex.radius + 0.16);
          const labelDistance = outerRadius + 26;
          const diffX = center + Math.cos(vertex.angle) * diffDistance;
          const diffY = center + Math.sin(vertex.angle) * diffDistance;
          const labelX = center + Math.cos(vertex.angle) * labelDistance;
          const labelY = center + Math.sin(vertex.angle) * labelDistance;
          const textAnchor =
            Math.abs(Math.cos(vertex.angle)) < 0.2 ? "middle" : Math.cos(vertex.angle) > 0 ? "start" : "end";
          return (
            <g key={vertex.key}>
              <circle
                cx={vertex.x}
                cy={vertex.y}
                r={highlight ? 5 : 3.5}
                fill="#f8fafc"
                stroke={color}
                strokeWidth={highlight ? 3 : 2}
                style={highlight ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}
              />
              {deltaLabel ? (
                <text
                  x={diffX}
                  y={diffY}
                  textAnchor={textAnchor}
                  dominantBaseline="central"
                  fontSize={10}
                  fontWeight={900}
                  fontStyle={vertex.delta < 0 ? "italic" : "normal"}
                  fill={vertex.delta > 0 ? "#fde68a" : "#cbd5e1"}
                  stroke="rgba(15,23,42,0.82)"
                  strokeWidth={2}
                  paintOrder="stroke"
                >
                  {deltaLabel}
                </text>
              ) : null}
              <text
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                dominantBaseline="central"
                fontSize={12}
                fontWeight={highlight ? 900 : 700}
                fill="#fff7ed"
              >
                {vertex.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
