"use client";

import type { ReactNode } from "react";

export interface RoguelikeBossTransitionProps {
  kind: "transform" | "limit-break";
  bossUrl?: string | null;
  statusLines?: readonly string[];
  visibleStatCount: number;
  children?: ReactNode;
}

export function RoguelikeBossTransition({
  kind,
  bossUrl,
  statusLines = [],
  visibleStatCount,
  children,
}: RoguelikeBossTransitionProps) {
  if (kind === "transform") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "70vh",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: "900",
            background:
              "linear-gradient(90deg, #f00, #f80, #ff0, #0f0, #08f, #80f, #f00)",
            backgroundSize: "300% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "rainbowShift 0.5s linear infinite",
          }}
        >
          ✨ 変身 ✨
        </div>
        <div style={{ color: "#fde68a", fontSize: 18, fontWeight: "bold" }}>
          ボスの姿が変化していく…
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70vh",
        gap: 24,
        background: "rgba(80,0,0,0.5)",
      }}
    >
      <div
        style={{
          fontSize: "clamp(28px, 4vw, 48px)",
          fontWeight: "900",
          color: "#ff2222",
          textShadow: "0 0 16px #ff0000, 0 0 32px #ff6600",
          animation: "rainbowShift 0.3s linear infinite",
          background:
            "linear-gradient(90deg, #f00, #f80, #f00, #f80, #f00)",
          backgroundSize: "300% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        💥 リミットブレイク 💥
      </div>
      <div style={{ color: "#fca5a5", fontSize: 18, fontWeight: "bold" }}>
        ステータスが激変した
      </div>
      {bossUrl && (
        <div
          style={{
            position: "relative",
            width: 240,
            height: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
              backgroundSize: "300% 300%",
              animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
              filter: "blur(18px)",
              opacity: 0.95,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -4,
              borderRadius: 28,
              background:
                "linear-gradient(135deg, #ff0040, #ff8a00, #fff200, #1dff7a, #00d4ff, #6a5cff, #ff00c8, #ff0040)",
              backgroundSize: "300% 300%",
              animation: "rainbowShift 0.7s linear infinite, limitBreakAuraPulse 1.8s ease-in-out infinite",
              boxShadow: "0 0 36px rgba(255,255,255,0.35)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bossUrl}
            alt="第20層のボス"
            style={{
              position: "relative",
              width: 220,
              height: 220,
              objectFit: "contain",
              borderRadius: 24,
              background: "rgba(0,0,0,0.35)",
              boxShadow: "0 0 30px rgba(255,255,255,0.25)",
            }}
          />
        </div>
      )}
      <div
        style={{
          color: "#fca5a5",
          fontSize: 15,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          textAlign: "center",
          border: "2px solid #ef4444",
          borderRadius: 10,
          padding: "12px 24px",
          background: "rgba(0,0,0,0.5)",
        }}
      >
        {statusLines.map((line, index) => {
          const isVisible = index < visibleStatCount;
          return (
            <div
              key={line}
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 500ms ease, transform 500ms ease",
                minHeight: 22,
              }}
            >
              {isVisible ? line : "\u00a0"}
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
