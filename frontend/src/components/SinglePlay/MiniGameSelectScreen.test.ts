import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MiniGameSelectScreen } from "./MiniGameSelectScreen";

test("mini-game selection renders cards from the registry", () => {
  const html = renderToStaticMarkup(createElement(MiniGameSelectScreen, {
    onSelect: () => {},
    onBack: () => {},
  }));

  assert.match(html, /ミニゲームを選択/);
  assert.match(html, /煌け!ダンス★バトル/);
  assert.match(html, /ラクガキチームでダンスバトル/);
  assert.match(html, /シングルプレイへ戻る/);
});
