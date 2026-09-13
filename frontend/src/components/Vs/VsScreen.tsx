"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { TYPE_BORDER_COLORS } from "@/components/Battle/BattlePanel";
import { StatRadarChart } from "@/components/Vs/StatRadarChart";
import { safeImageUrl } from "@/lib/imageUrl";
import { getDrawingTagByLabel } from "@/lib/drawingTags";
import { BASE_STATS } from "@/lib/statCalculator";
import { soundManager } from "@/lib/soundManager";
import { VS_SCREEN_DURATION_MS, VS_SCREEN_FADE_OUT_MS } from "@/lib/vsTransition";
import type { PlayerBattleState } from "@/types/game";

function withAlpha(hex: string, alphaHex: string) {
  return `${hex}${alphaHex}`;
}

const VS_SEAM_TOP_PERCENT = 58;
const VS_SEAM_BOTTOM_PERCENT = 42;
const PORTRAIT_SLIDE_MS = 420;
const TAG_FADE_DELAY_MS = PORTRAIT_SLIDE_MS + 80;
const RADAR_FADE_DELAY_MS = PORTRAIT_SLIDE_MS + 260;

function buildVsSeamCrackPolygon() {
  const yStops = [0, 5, 13, 21, 29, 37, 45, 55, 63, 71, 79, 87, 95, 100];
  const jagOffsets = [-13, 12, -6, 17, -15, 13, -10, 15, -16, 11, -12, 16, -7, 9];
  const amplitude = 0.4;

  const centerX = (y: number) =>
    VS_SEAM_TOP_PERCENT + ((VS_SEAM_BOTTOM_PERCENT - VS_SEAM_TOP_PERCENT) * y) / 100;

  const rightEdge = yStops.map((y, i) => [centerX(y) + jagOffsets[i] * amplitude, y] as const);
  const leftEdge = yStops.map((y, i) => [centerX(y) - jagOffsets[i] * amplitude, y] as const);

  const points = [...rightEdge, ...[...leftEdge].reverse()];
  return points.map(([x, y]) => `${x}% ${y}%`).join(", ");
}

const VS_SEAM_CRACK_POLYGON = buildVsSeamCrackPolygon();

export function getVsScreenSideBackground(characterType: PlayerBattleState["characterType"], side: "left" | "right") {
  const color = TYPE_BORDER_COLORS[characterType];
  const accent = withAlpha(color, "dd");
  const soft = withAlpha(color, "66");
  const dark = withAlpha(color, "22");
  return side === "left"
    ? `linear-gradient(135deg, ${accent} 0%, ${soft} 58%, rgba(10,10,10,0.94) 100%), radial-gradient(circle at 18% 28%, ${withAlpha(color, "99")} 0%, transparent 48%), radial-gradient(circle at 76% 74%, ${dark} 0%, transparent 52%)`
    : `linear-gradient(315deg, ${accent} 0%, ${soft} 58%, rgba(10,10,10,0.94) 100%), radial-gradient(circle at 82% 28%, ${withAlpha(color, "99")} 0%, transparent 48%), radial-gradient(circle at 24% 74%, ${dark} 0%, transparent 52%)`;
}

interface VsScreenProps {
  me: PlayerBattleState;
  enemy: PlayerBattleState;
  onComplete: () => void;
}

function useMediaMatch(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function FadeInBlock({
  delayMs,
  children,
  align,
}: {
  delayMs: number;
  children: ReactNode;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        animation: `slideInFromBottom 280ms ease-out ${delayMs}ms both`,
      }}
    >
      {children}
    </div>
  );
}

function TagChip({ label, color }: { label: string; color: string }) {
  const title = getDrawingTagByLabel(label)?.effectText;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        border: `1.5px solid ${color}`,
        background: "rgba(0,0,0,0.62)",
        color: "#fff7ed",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: "0.03em",
        boxShadow: "0 6px 16px rgba(0,0,0,0.28)",
      }}
    >
      {label}
    </span>
  );
}

function VsPortrait({
  player,
  side,
  compact,
}: {
  player: PlayerBattleState;
  side: "left" | "right";
  compact: boolean;
}) {
  const color = TYPE_BORDER_COLORS[player.characterType];
  const tags = (player.drawingTags ?? []).slice(0, compact ? 1 : 2);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        width: compact ? "min(42vw, 240px)" : "min(38vw, 420px)",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: side === "left" ? "flex-start" : "flex-end",
        gap: 16,
        animation: `${side === "left" ? "slideInFromLeft" : "slideInFromRight"} ${PORTRAIT_SLIDE_MS}ms ease-out both`,
      }}
    >
      <div
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: `2px solid ${color}`,
          background: "rgba(0,0,0,0.62)",
          color: "#fff7ed",
          fontWeight: 900,
          fontSize: "clamp(20px, 2vw, 30px)",
          letterSpacing: "0.08em",
          boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
          textAlign: side === "left" ? "left" : "right",
        }}
      >
        {player.nickname}
      </div>
      {tags.length > 0 ? (
        <FadeInBlock delayMs={TAG_FADE_DELAY_MS} align={side}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: side === "left" ? "flex-start" : "flex-end",
            }}
          >
            {tags.map((tag) => (
              <TagChip key={tag} label={tag} color={color} />
            ))}
          </div>
        </FadeInBlock>
      ) : null}
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: compact ? "min(42vw, 220px)" : "min(46vw, 420px)",
          display: "flex",
          alignItems: "center",
          justifyContent: side === "left" ? "flex-start" : "flex-end",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: side === "left" ? "12% 18% 8% 0" : "12% 0 8% 18%",
            borderRadius: 28,
            background: `linear-gradient(180deg, ${withAlpha(color, "55")} 0%, rgba(0,0,0,0.08) 100%)`,
            filter: "blur(10px)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={safeImageUrl(player.imageDataUrl)}
          alt={player.nickname}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: compact ? 220 : 360,
            maxHeight: compact ? "min(42vw, 220px)" : "min(46vw, 420px)",
            objectFit: "contain",
            filter:
              "drop-shadow(2px 0 0 rgba(248,250,252,0.95)) drop-shadow(-2px 0 0 rgba(248,250,252,0.95)) drop-shadow(0 2px 0 rgba(248,250,252,0.95)) drop-shadow(0 -2px 0 rgba(248,250,252,0.95)) drop-shadow(0 12px 24px rgba(0,0,0,0.5))",
          }}
        />
      </div>
      <FadeInBlock delayMs={RADAR_FADE_DELAY_MS} align={side}>
        <StatRadarChart
          stats={player.stats}
          base={BASE_STATS[player.characterType]}
          color={color}
          size={compact ? 150 : 220}
          animate
          side={side}
        />
      </FadeInBlock>
    </div>
  );
}

export function VsScreen({ me, enemy, onComplete }: VsScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const compact = useMediaMatch("(max-width: 720px)");
  const contentGap = compact ? 12 : 24;
  const contentPadding = compact ? 20 : 48;
  const vsWidth = compact ? "min(28vw, 130px)" : "min(34vw, 260px)";

  useEffect(() => {
    soundManager.stopBgm();
    soundManager.playSe("/sounds/se/vs.mp3");
    const fadeTimer = window.setTimeout(() => setIsFadingOut(true), VS_SCREEN_DURATION_MS - VS_SCREEN_FADE_OUT_MS);
    const completeTimer = window.setTimeout(() => onComplete(), VS_SCREEN_DURATION_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "70vh",
        overflow: "hidden",
        borderRadius: 24,
        opacity: isFadingOut ? 0 : 1,
        transform: isFadingOut ? "scale(1.02)" : "scale(1)",
        transition: `opacity ${VS_SCREEN_FADE_OUT_MS}ms ease, transform ${VS_SCREEN_FADE_OUT_MS}ms ease`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.42)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#05060d",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(0 0, ${VS_SEAM_TOP_PERCENT}% 0, ${VS_SEAM_BOTTOM_PERCENT}% 100%, 0 100%)`,
          background: getVsScreenSideBackground(me.characterType, "left"),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(${VS_SEAM_TOP_PERCENT}% 0, 100% 0, 100% 100%, ${VS_SEAM_BOTTOM_PERCENT}% 100%)`,
          background: getVsScreenSideBackground(enemy.characterType, "right"),
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.96) 0%, rgba(25,25,25,0.96) 100%)",
          clipPath: `polygon(${VS_SEAM_CRACK_POLYGON})`,
          boxShadow: "0 0 24px rgba(0,0,0,0.65)",
          opacity: 0.95,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: contentGap,
          padding: `clamp(20px, 4vw, ${contentPadding}px)`,
        }}
      >
        <VsPortrait player={me} side="left" compact={compact} />
        <VsPortrait player={enemy} side="right" compact={compact} />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <svg
          viewBox="0 0 240 160"
          role="img"
          aria-label="VS"
          style={{
            width: vsWidth,
            overflow: "visible",
            filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.5))",
            animation: "fadeInScale 360ms ease-out",
          }}
        >
          <g transform="rotate(-8 120 80)">
            <text
              x="120"
              y="112"
              textAnchor="middle"
              fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
              fontWeight={900}
              fontStyle="italic"
              fontSize="120"
              fill="#ef4444"
              stroke="#fff7ed"
              strokeWidth="10"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              VS
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
