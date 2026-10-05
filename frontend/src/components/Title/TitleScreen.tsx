"use client";

import { useEffect, useState } from "react";
import { OptionsPanel } from "@/components/Options/OptionsPanel";
import { loadSlots } from "@/lib/drawingSlots";
import { soundManager } from "@/lib/soundManager";
import { TitleDoodleStage } from "./TitleDoodleStage";
import { selectTitleDoodles, type DoodleReaction } from "./doodleBehavior";

interface TitleMenuItem {
  key: string;
  icon: string;
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
}

export function TitleScreen(props: {
  onSinglePlay: () => void;
  onMultiPlay: () => void;
  onGhostMatch: () => void;
  onProfile: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [savedDoodles, setSavedDoodles] = useState<string[]>([]);
  const [hoveredMenu, setHoveredMenu] = useState<DoodleReaction>(null);
  const [focusedMenu, setFocusedMenu] = useState<DoodleReaction>(null);

  useEffect(() => {
    setSavedDoodles(selectTitleDoodles(loadSlots()));
  }, []);

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
      color: "#e99a24",
      onClick: withClickSe(props.onSinglePlay),
    },
    {
      key: "multi",
      icon: "👥",
      label: "マルチプレイ",
      sub: "友だちとラクガキ対戦",
      color: "#438ed0",
      onClick: withClickSe(props.onMultiPlay),
    },
    {
      key: "ghost",
      icon: "👻",
      label: "ゴーストマッチ",
      sub: "誰かのラクガキと戦う",
      color: "#9662c6",
      onClick: withClickSe(props.onGhostMatch),
    },
    {
      key: "profile",
      icon: "📜",
      label: "プロフィール",
      sub: "戦績とラクガキ帳",
      color: "#278d81",
      onClick: withClickSe(props.onProfile),
    },
    {
      key: "options",
      icon: "⚙️",
      label: "オプション",
      sub: "音量などの設定",
      color: "#787b82",
      onClick: withClickSe(() => setOptionsOpen(true)),
    },
  ];

  return (
    <>
      <section className={`title-screen${savedDoodles.length ? " title-screen-with-doodles" : ""}`} aria-label="arttle タイトル">
        <TitleDoodleStage images={savedDoodles} reaction={hoveredMenu ?? focusedMenu} paused={optionsOpen} />

        <header className="title-heading">
          <h1 className="title-logo">arttle</h1>
          <p className="title-tagline">描いたラクガキで戦う</p>
        </header>

        <nav className="title-menu" aria-label="メインメニュー">
          {menuItems.map((item, index) => (
            <button
              key={item.key}
              className="title-menu-button"
              onClick={item.onClick}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") {
                  setHoveredMenu(item.key === "single" || item.key === "multi" || item.key === "profile" ? item.key : null);
                }
              }}
              onPointerLeave={() => setHoveredMenu(null)}
              onFocus={() => setFocusedMenu(item.key === "single" || item.key === "multi" || item.key === "profile" ? item.key : null)}
              onBlur={() => setFocusedMenu(null)}
              style={{
                ["--menu-accent" as string]: item.color,
                ["--menu-delay" as string]: `${index * 90}ms`,
              }}
            >
              <span className="title-menu-icon" aria-hidden="true">{item.icon}</span>
              <span className="title-menu-copy">
                <span className="title-menu-label">{item.label}</span>
                <span className="title-menu-sub">{item.sub}</span>
              </span>
              <span className="title-menu-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </nav>
      </section>
      <OptionsPanel open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </>
  );
}
