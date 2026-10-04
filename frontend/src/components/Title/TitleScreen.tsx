"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { OptionsPanel } from "@/components/Options/OptionsPanel";
import { FALLBACK_CHARACTER_IMAGE_URL, resolveCharacterImageUrl } from "@/lib/imageUrl";
import { loadSlots } from "@/lib/drawingSlots";
import { soundManager } from "@/lib/soundManager";

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

  useEffect(() => {
    const thumbnails = loadSlots()
      .flatMap((slot) => (slot?.thumbnail ? [resolveCharacterImageUrl(slot.thumbnail)] : []))
      .filter((thumbnail) => thumbnail !== FALLBACK_CHARACTER_IMAGE_URL)
      .slice(0, 2);
    setSavedDoodles(thumbnails);
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
      <section className="title-screen" aria-label="arttle タイトル">
        {savedDoodles.map((thumbnail, index) => (
          <Image
            key={`${index}-${thumbnail.slice(0, 32)}`}
            className={`title-saved-doodle title-saved-doodle-${index + 1}`}
            src={thumbnail}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={120}
            height={120}
            unoptimized
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ))}

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
