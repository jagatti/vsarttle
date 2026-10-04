import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleScreen } from "./TitleScreen";
import { DifficultySelectScreen } from "../SinglePlay/SinglePlayManager";
import { RoomPanel } from "../Room/RoomPanel";

const noop = () => {};
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

test("title keeps its original tagline without the additional kicker", () => {
  const html = renderToStaticMarkup(createElement(TitleScreen, {
    onSinglePlay: noop, onMultiPlay: noop, onGhostMatch: noop, onProfile: noop,
  }));
  assert.match(html, /描いたラクガキで戦う/);
  assert.doesNotMatch(html, /らくがきから、ぼうけんがはじまる|title-kicker/);
  assert.doesNotMatch(css, /title-kicker/);
});

test("difficulty renders one heading, shared buttons, a readable lock status and a back action", () => {
  const html = renderToStaticMarkup(createElement(DifficultySelectScreen, {
    onSelect: noop, onSelectRoguelike: noop, onBackToTitle: noop,
    playerProfile: { playerId: "test-player", nickname: "テスト" },
  }));
  assert.equal((html.match(/難易度を選択してください/g) ?? []).length, 1);
  assert.equal((html.match(/class="title-menu-button/g) ?? []).length, 4);
  assert.match(html, /disabled="" aria-describedby="roguelike-status"/);
  assert.match(html, /🔒/);
  assert.match(html, /id="roguelike-status" class="difficulty-note" role="status"/);
  assert.match(html, /解禁条件を確認中/);
  assert.match(html, /タイトルへ戻る/);
});

test("shared menu surfaces remain opaque with readable disabled text and 44px targets", () => {
  assert.match(rule(".title-menu-button"), /background: #fffaee;/);
  assert.match(rule(".title-menu-button"), /min-height: 54px;/);
  assert.match(rule(".title-menu-button:disabled"), /background: #e8e2d6;/);
  assert.match(rule(".title-menu-button:disabled"), /color: #57534e;/);
  assert.match(rule(".title-menu-button:disabled"), /opacity: 1;/);
  assert.match(rule(".difficulty-screen"), /background: #fffaee;/);
  assert.match(rule(".difficulty-note"), /font-size: 15px;/);
  assert.match(rule("main.title-bgm-active .app-panel"), /background: #191c2b;/);
  assert.match(rule(".options-close-button"), /min-height: 44px;/);
  assert.match(rule(".difficulty-button,\n.difficulty-back"), /flex: none;/);
});

test("menu, heading, lock and unlock condition text meet WCAG AA contrast", () => {
  function luminance(hex: string) {
    const rgb = hex.match(/[a-f\d]{2}/gi)!.map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  for (const selector of [".title-menu-button", ".title-menu-button:disabled", ".difficulty-screen", ".difficulty-note"]) {
    const styles = rule(selector);
    const foreground = styles.match(/(?:^|\n)\s*color: (#[a-f\d]{6});/)![1];
    const background = styles.match(/(?:^|\n)\s*background: (#[a-f\d]{6});/)![1];
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const ratio = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(ratio >= 4.5, `${selector}: ${ratio.toFixed(2)}:1`);
  }
});

test("room mode selection retains a pressed state and disabled join/create actions", () => {
  const html = renderToStaticMarkup(createElement(RoomPanel, {
    status: "待機中", roomCode: "", nickname: "", canUseSignaling: true,
    onNicknameChange: noop, onCreate: noop, onJoin: noop, onBackToTitle: noop,
  }));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.equal((html.match(/class="title-menu-button/g) ?? []).length, 5);
});
