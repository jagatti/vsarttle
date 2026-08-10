"use client";

import { useEffect, useState } from "react";
import { TYPE_BORDER_COLORS } from "@/components/Battle/BattlePanel";
import { safeImageUrl } from "@/lib/imageUrl";
import { soundManager } from "@/lib/soundManager";
import { VS_SCREEN_DURATION_MS, VS_SCREEN_FADE_OUT_MS } from "@/lib/vsTransition";
import type { PlayerBattleState } from "@/types/game";

function withAlpha(hex: string, alphaHex: string) {
  return `${hex}${alphaHex}`;
}

// The center seam is expressed entirely in percentages of the container so the
// diagonal crack overlay always lines up exactly with the two background halves,
// regardless of the container's actual pixel size or aspect ratio.
const VS_SEAM_TOP_PERCENT = 58;
const VS_SEAM_BOTTOM_PERCENT = 42;

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

function VsPortrait({ player, side }: { player: PlayerBattleState; side: "left" | "right" }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 2,
        width: "min(38vw, 420px)",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: side === "left" ? "flex-start" : "flex-end",
        gap: 16,
        animation: `${side === "left" ? "slideInFromLeft" : "slideInFromRight"} 420ms ease-out both`,
      }}
    >
      <div
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: `2px solid ${TYPE_BORDER_COLORS[player.characterType]}`,
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
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: "min(46vw, 420px)",
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
            background: `linear-gradient(180deg, ${withAlpha(TYPE_BORDER_COLORS[player.characterType], "55")} 0%, rgba(0,0,0,0.08) 100%)`,
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
            maxWidth: 360,
            maxHeight: "min(46vw, 420px)",
            objectFit: "contain",
            filter:
              "drop-shadow(0 12px 24px rgba(0,0,0,0.5)) drop-shadow(0 0 18px rgba(255,255,255,0.18))",
          }}
        />
      </div>
    </div>
  );
}

export function VsScreen({ me, enemy, onComplete }: VsScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

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
          gap: 24,
          padding: "clamp(24px, 4vw, 48px)",
        }}
      >
        <VsPortrait player={me} side="left" />
        <VsPortrait player={enemy} side="right" />
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
            width: "min(34vw, 260px)",
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
