"use client";

import { useEffect, useRef, useState } from "react";
import { soundManager } from "@/lib/soundManager";

const DEFAULT_BGM_VOLUME = 0.08;
const DEFAULT_SE_VOLUME = 0.12;
const BGM_PREVIEW_PATH = "/sounds/bgm/oekaki_loop.mp3";
const SE_PREVIEW_PATH = "/sounds/se/barrier.mp3";
const SE_PREVIEW_DEBOUNCE_MS = 100;

export function OptionsPanel(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { open, onClose } = props;
  const [bgmVol, setBgmVol] = useState(DEFAULT_BGM_VOLUME);
  const [seVol, setSeVol] = useState(DEFAULT_SE_VOLUME);
  const panelRef = useRef<HTMLDivElement>(null);
  const sePreviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setBgmVol(soundManager.getBgmVolume());
    setSeVol(soundManager.getSeVolume());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    if (sePreviewTimeoutRef.current) {
      clearTimeout(sePreviewTimeoutRef.current);
      sePreviewTimeoutRef.current = null;
    }
    soundManager.stopBgm();
  }, [open]);

  useEffect(() => {
    return () => {
      if (sePreviewTimeoutRef.current) {
        clearTimeout(sePreviewTimeoutRef.current);
      }
      soundManager.stopBgm();
    };
  }, []);

  const handleBgmChange = (v: number) => {
    setBgmVol(v);
    soundManager.setBgmVolume(v);
    soundManager.playBgm(BGM_PREVIEW_PATH);
  };

  const handleSeChange = (v: number) => {
    setSeVol(v);
    soundManager.setSeVolume(v);
    if (sePreviewTimeoutRef.current) {
      clearTimeout(sePreviewTimeoutRef.current);
    }
    sePreviewTimeoutRef.current = setTimeout(() => {
      soundManager.playSe(SE_PREVIEW_PATH);
      sePreviewTimeoutRef.current = null;
    }, SE_PREVIEW_DEBOUNCE_MS);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "#1a1a2e",
          border: "2px solid #4b5563",
          borderRadius: 12,
          padding: "16px 20px",
          width: "min(100%, 320px)",
          boxShadow: "0 6px 28px rgba(0,0,0,0.65)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <span style={{ color: "#fde68a", fontWeight: "bold", fontSize: 14 }}>
            🔊 サウンド設定
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
            title="閉じる"
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#d1d5db", fontSize: 13, display: "block", marginBottom: 6 }}>
            BGM音量：{Math.round(bgmVol * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(bgmVol * 100)}
            onChange={(e) => handleBgmChange(Number(e.target.value) / 100)}
            style={{ width: "100%", accentColor: "#fde68a" }}
          />
        </div>

        <div>
          <label style={{ color: "#d1d5db", fontSize: 13, display: "block", marginBottom: 6 }}>
            SE音量：{Math.round(seVol * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(seVol * 100)}
            onChange={(e) => handleSeChange(Number(e.target.value) / 100)}
            style={{ width: "100%", accentColor: "#fde68a" }}
          />
        </div>
      </div>
    </div>
  );
}
