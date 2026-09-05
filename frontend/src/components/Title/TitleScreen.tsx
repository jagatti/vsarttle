"use client";

import { useState } from "react";
import { OptionsPanel } from "@/components/Options/OptionsPanel";
import { TitleDoodleBackdrop, TitleHowItWorksStrip } from "@/components/Title/TitleDoodles";
import { soundManager } from "@/lib/soundManager";

interface TitleMenuItem {
  key: string;
  icon: string;
  label: string;
  sub: string;
  color: string;
  textColor: string;
  tilt: number;
  onClick: () => void;
}

export function TitleScreen(props: {
  onSinglePlay: () => void;
  onMultiPlay: () => void;
  onGhostMatch: () => void;
  onProfile: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);

  const withClickSe = (handler: () => void) => () => {
    soundManager.playSe("/sounds/se/button.mp3");
    handler();
  };

  const menuItems: TitleMenuItem[] = [
    {
      key: "single",
      icon: "🎮",
      label: "シングルプレイ",
      sub: "ひとりでボスに挑む",
      color: "#fbbf24",
      textColor: "#fff7db",
      tilt: -0.8,
      onClick: withClickSe(props.onSinglePlay),
    },
    {
      key: "multi",
      icon: "👥",
      label: "マルチプレイ",
      sub: "友だちとラクガキ対戦",
      color: "#60a5fa",
      textColor: "#e0f2fe",
      tilt: 0.7,
      onClick: withClickSe(props.onMultiPlay),
    },
    {
      key: "ghost",
      icon: "👻",
      label: "ゴーストマッチ",
      sub: "誰かのラクガキと戦う",
      color: "#c084fc",
      textColor: "#f3e8ff",
      tilt: -0.5,
      onClick: withClickSe(props.onGhostMatch),
    },
    {
      key: "profile",
      icon: "📜",
      label: "プロフィール",
      sub: "戦績とラクガキ帳",
      color: "#2dd4bf",
      textColor: "#ccfbf1",
      tilt: 0.6,
      onClick: withClickSe(props.onProfile),
    },
    {
      key: "options",
      icon: "⚙️",
      label: "オプション",
      sub: "音量などの設定",
      color: "#94a3b8",
      textColor: "#e2e8f0",
      tilt: -0.4,
      onClick: withClickSe(() => setOptionsOpen(true)),
    },
  ];

  return (
    <>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "88vh",
          gap: 22,
          overflow: "hidden",
        }}
      >
        <TitleDoodleBackdrop />

        {/* ロゴ（既存の方向性を尊重しつつ、手描きのマーカー下線を足す） */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div
            style={{
              fontSize: "clamp(56px, 10vw, 120px)",
              fontWeight: "900",
              letterSpacing: "0.05em",
              lineHeight: 1,
              background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 40%, #8b5cf6 80%, #3b82f6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "none",
              filter: "drop-shadow(0 4px 24px rgba(239,68,68,0.4))",
              animation: "titlePulse 3s ease-in-out infinite",
            }}
          >
            arttle
          </div>
          <svg
            viewBox="0 0 300 18"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ display: "block", width: "min(74vw, 420px)", height: 14, margin: "2px auto 0" }}
          >
            <path
              d="M6 12c48-7 96-9 144-5 46 4 92 1 146-4"
              stroke="#fbbf24"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              opacity="0.85"
            />
          </svg>
        </div>

        {/* キャッチコピー：このゲームが何なのかを一行で伝える */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            color: "#f8fafc",
            fontSize: "clamp(15px, 2.2vw, 26px)",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textShadow: "0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(148,163,184,0.35)",
          }}
        >
          描いたラクガキが、戦う。
        </div>

        <TitleHowItWorksStrip />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: 360,
            marginTop: 6,
          }}
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              className="doodle-btn"
              onClick={item.onClick}
              style={{
                ["--doodle-tilt" as string]: `${item.tilt}deg`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                textAlign: "left",
                borderColor: item.color,
                background: "rgba(9,11,20,0.72)",
                color: item.textColor,
                boxShadow: `0 4px 0 ${item.color}66, 0 10px 22px rgba(0,0,0,0.45)`,
              }}
            >
              <span style={{ fontSize: "clamp(20px, 2.4vw, 28px)", lineHeight: 1 }}>{item.icon}</span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ fontSize: "clamp(15px, 1.8vw, 20px)", letterSpacing: "0.04em" }}>{item.label}</span>
                <span style={{ fontSize: "clamp(10px, 1.05vw, 13px)", color: "#94a3b8", fontWeight: 700 }}>{item.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <OptionsPanel open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </>
  );
}
