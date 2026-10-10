import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DrawPanel } from "./DrawPanel";
import { SinglePlayManager } from "../SinglePlay/SinglePlayManager";
import { RoguelikeManager } from "../RoguelikeMode/RoguelikeManager";

function renderDraw(overrides: Partial<Parameters<typeof DrawPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(DrawPanel, {
    seconds: 60,
    onComplete: () => {},
    ...overrides,
  }));
}

test("drawing tools distinguish the active pen and show numeric sizes and current color", () => {
  const markup = renderDraw();
  assert.match(markup, /aria-label="ペン" aria-pressed="true"/);
  assert.match(markup, /aria-label="塗りつぶし" aria-pressed="false"/);
  assert.ok(markup.indexOf('aria-label="ペン"') < markup.indexOf('aria-label="塗りつぶし"'));
  assert.ok(markup.indexOf('aria-label="塗りつぶし"') < markup.indexOf('aria-label="消しゴム"'));
  assert.ok(markup.includes("使用中"));
  for (const size of [3, 8, 14, 22, 32]) {
    assert.ok(markup.includes(`aria-label="太さ ${size}px"`));
    assert.ok(markup.includes(`>${size}px</span>`));
  }
  assert.ok(markup.includes("現在のペン"));
  assert.ok(markup.includes("#111111"));
  assert.match(markup, /aria-label="好きな色を選ぶ"/);
  assert.match(markup, /cursor:url\(/);
  assert.match(markup, /width="400" height="400"/);
  assert.match(markup, /disabled="" aria-label="元に戻す"/);
  assert.match(markup, /disabled="" aria-label="やり直す"/);
});

test("single and roguelike set, and multiplayer/ghost complete immediately below the canvas", () => {
  for (const overrides of [
    {},
    { noTimer: true },
    { noTimer: true, onSet: () => {} },
    { completeLabel: "準備完了" },
  ]) {
    const markup = renderDraw(overrides);
    const label = "onSet" in overrides ? "セット" : "completeLabel" in overrides ? overrides.completeLabel : "完成";
    assert.match(markup, new RegExp(`</canvas><button class="draw-primary-action">${label}</button>`));
    assert.ok(markup.indexOf('class="draw-primary-action"') < markup.indexOf("保存スロット"));
    assert.equal(markup.includes("残り 60 秒"), !overrides.noTimer);
    assert.equal(markup.includes(">セット</button>"), "onSet" in overrides);
  }
});

test("drawing layout has a compact desktop toolbar and a narrow-container horizontal fallback", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.draw-workspace\s*\{[^}]*grid-template-columns: 190px minmax\(0, 500px\)/);
  assert.match(css, /@container \(max-width: 560px\)[\s\S]*\.draw-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 500px\)/);
  assert.match(css, /@container \(max-width: 560px\)[\s\S]*\.draw-tools\s*\{[^}]*flex-direction: row/);
  assert.match(css, /\.draw-panel\s*\{[^}]*border: 2px solid #fde68a/);
});

test("roguelike keeps a single preview with battle start disabled until set", () => {
  const markup = renderToStaticMarkup(createElement(RoguelikeManager, {
    onBackToTitle: () => {},
    playerProfile: { playerId: "test-player", nickname: "テスト" },
  }));
  assert.ok(markup.includes('class="drawing-mode-layout"'));
  assert.ok(markup.includes('class="drawing-mode-sidebar"'));
  assert.equal((markup.match(/「セット」で作品を登録/g) ?? []).length, 1);
  assert.match(markup, /<button disabled=""[^>]*>⚔️ バトル開始<\/button>/);
  assert.ok(markup.includes('class="draw-primary-action">セット</button>'));
  assert.ok(!markup.includes("枠 2"));
});

test("single play keeps its existing difficulty selection before drawing", () => {
  const markup = renderToStaticMarkup(createElement(SinglePlayManager, {
    onBackToTitle: () => {},
    playerProfile: { playerId: "test-player", nickname: "テスト" },
  }));
  assert.ok(markup.includes("difficulty-screen"));
  assert.ok(!markup.includes("draw-panel"));
});
