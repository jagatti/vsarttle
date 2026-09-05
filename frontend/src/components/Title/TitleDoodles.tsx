"use client";

import type { CSSProperties } from "react";

/**
 * タイトル画面の背景に置く「ラクガキ」たち。
 * 画像アセットを増やさずに済むよう、すべて手描き風の SVG パスで表現する。
 * 情報過多にならないよう線は細く・薄く、主役（ロゴとメニュー）を邪魔しない。
 */

const INK = "#f8fafc";

function doodleStyle(style: CSSProperties, driftDuration: number, delay: number): CSSProperties {
  return {
    ...style,
    ["--drift-duration" as string]: `${driftDuration}s`,
    animationDelay: `${delay}s`,
  };
}

/** 丸っこいラクガキ生物（左のファイター） */
function DoodleFighter({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" style={style} aria-hidden="true">
      <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 74c-6-26 10-46 32-46s34 18 30 44c-3 18-16 26-31 26s-28-7-31-24z" />
        <path d="M40 62c2-5 8-5 10 0" />
        <path d="M70 62c2-5 8-5 10 0" />
        <path d="M48 82c6 6 16 6 22 0" />
        <path d="M26 70 6 58" />
        <path d="M94 70l18-14" />
        <path d="M44 100 36 118" />
        <path d="M76 100l8 18" />
        <path d="M60 28c-2-10 4-16 10-18" />
      </g>
    </svg>
  );
}

/** ぐるぐる渦のラクガキ生物（右のファイター） */
function DoodleRival({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" style={style} aria-hidden="true">
      <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 40c8-16 30-20 44-10s16 34 4 48-38 16-48 2-8-26 0-40z" />
        <path d="M44 54l12 8-12 8" />
        <path d="M84 54l-12 8 12 8" />
        <path d="M50 88c8-6 16-6 24 0" />
        <path d="M34 34 18 20" />
        <path d="M88 32l16-14" />
        <path d="M46 104l-6 14" />
        <path d="M78 104l6 14" />
      </g>
    </svg>
  );
}

/** ぐるぐる線・星・稲妻などの「余白のラクガキ」 */
function DoodleScribble({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 140 90" width="100%" height="100%" fill="none" style={style} aria-hidden="true">
      <g stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 62c14-34 30-38 40-18s22 20 32-4 26-14 32 12" />
        <path d="M104 18l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" />
      </g>
    </svg>
  );
}

/** 手描きの効果線（バトル感を薄く漂わせる） */
function DoodleImpactLines({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" style={style} aria-hidden="true">
      <g stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M60 8v22" />
        <path d="M60 90v22" />
        <path d="M8 60h22" />
        <path d="M90 60h22" />
        <path d="M24 24l16 16" />
        <path d="M96 24 80 40" />
        <path d="M24 96l16-16" />
        <path d="M96 96 80 80" />
      </g>
    </svg>
  );
}

export function TitleDoodleBackdrop() {
  return (
    <div className="title-doodle-layer" aria-hidden="true">
      <div style={{ position: "absolute", inset: 0, opacity: 0.16 }}>
        <div style={{ position: "absolute", left: "4%", top: "24%", width: "clamp(120px, 17vw, 250px)" }}>
          <DoodleFighter style={doodleStyle({ animation: "titleDoodleDrift 9s ease-in-out infinite" }, 9, 0)} />
        </div>
        <div style={{ position: "absolute", right: "4%", top: "30%", width: "clamp(120px, 17vw, 250px)" }}>
          <DoodleRival style={doodleStyle({ animation: "titleDoodleDrift 11s ease-in-out infinite" }, 11, 0.8)} />
        </div>
        <div style={{ position: "absolute", left: "16%", bottom: "8%", width: "clamp(110px, 15vw, 210px)" }}>
          <DoodleScribble style={doodleStyle({ animation: "titleDoodleDrift 13s ease-in-out infinite" }, 13, 1.4)} />
        </div>
        <div style={{ position: "absolute", right: "14%", bottom: "12%", width: "clamp(90px, 12vw, 170px)" }}>
          <DoodleImpactLines style={doodleStyle({ animation: "titleDoodleDrift 10s ease-in-out infinite" }, 10, 0.4)} />
        </div>
        <div style={{ position: "absolute", left: "44%", top: "4%", width: "clamp(70px, 9vw, 130px)" }}>
          <DoodleImpactLines style={doodleStyle({ animation: "titleDoodleDrift 12s ease-in-out infinite" }, 12, 1.9)} />
        </div>
      </div>
    </div>
  );
}

/**
 * 「描く → 戦う」を一目で伝える 3 コマのミニ図。
 * ゲーム内容の説明文を増やさずに、タイトル画面だけで遊びが伝わるようにする。
 */
export function TitleHowItWorksStrip() {
  const frameStyle: CSSProperties = {
    width: "clamp(74px, 9vw, 104px)",
    height: "clamp(74px, 9vw, 104px)",
    border: "3px solid rgba(248,250,252,0.55)",
    borderRadius: "255px 14px 225px 15px / 15px 225px 15px 255px",
    background: "rgba(10,12,22,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  };
  const arrowStyle: CSSProperties = {
    color: "#fcd34d",
    fontSize: "clamp(18px, 2vw, 26px)",
    fontWeight: 900,
  };
  const labelStyle: CSSProperties = {
    color: "#e2e8f0",
    fontSize: "clamp(10px, 1vw, 13px)",
    fontWeight: 700,
    marginTop: 6,
    textAlign: "center",
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "clamp(8px, 1.2vw, 16px)", zIndex: 1 }}>
      <div>
        <div style={frameStyle}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
            <g stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 76c8-30 22-40 30-24s16 14 22-6" />
              <path d="M62 30l14-14 10 10-14 14z" />
              <path d="M62 30 58 44l14-4" />
            </g>
          </svg>
        </div>
        <div style={labelStyle}>ラクガキを描く</div>
      </div>
      <div style={{ ...arrowStyle, alignSelf: "center", marginTop: -14 }}>▶</div>
      <div>
        <div style={frameStyle}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
            <g stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 74c-4-20 6-34 22-34s24 12 22 30" />
              <path d="M28 58c1-4 6-4 7 0" />
              <path d="M46 58c1-4 6-4 7 0" />
              <path d="M66 34l18 18" />
              <path d="M84 34 66 52" />
            </g>
          </svg>
        </div>
        <div style={labelStyle}>ステータスになる</div>
      </div>
      <div style={{ ...arrowStyle, alignSelf: "center", marginTop: -14 }}>▶</div>
      <div>
        <div style={frameStyle}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
            <g stroke="#fcd34d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M50 12v18" />
              <path d="M50 70v18" />
              <path d="M12 50h18" />
              <path d="M70 50h18" />
              <path d="M50 34l10 16-10 16-10-16z" />
            </g>
          </svg>
        </div>
        <div style={labelStyle}>ラクガキで戦う</div>
      </div>
    </div>
  );
}
