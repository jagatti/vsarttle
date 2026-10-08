import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoguelikeUpgradePanel, type RoguelikeUpgradePanelProps } from "@/components/RoguelikeMode/RoguelikeUpgradePanel";
import { ROGUELIKE_PLAYER_INITIAL_STATS } from "@/lib/roguelikeEnemyStats";

function renderPanel(props: Partial<RoguelikeUpgradePanelProps> = {}) {
  return renderToStaticMarkup(createElement(RoguelikeUpgradePanel, {
    floor: 1,
    player: {
      id: "p2", nickname: "p2", imageDataUrl: "", characterType: "balanced",
      stats: { ...ROGUELIKE_PLAYER_INITIAL_STATS }, currentHp: 250, currentPp: 50,
      chargeMultiplier: 1, lastActionCategory: null,
    },
    acquiredSkills: {},
    choices: [
      { kind: "weak-stat", rarity: 1, key: "attack", amount: 10 },
      { kind: "weak-magic", rarity: 3, effectKind: "paralysis", effectName: "まひ" },
      { kind: "weak-stat", rarity: 1, key: "defense", amount: 10 },
    ],
    onSelect: () => {},
    ...props,
  }));
}

test("co-op reward panel keeps all slots, labels picked/invalid choices, and grays out only disabled slots", () => {
  const html = renderPanel({
    choiceDisabledReason: (index) => index === 0 ? "相手が選んだ枠" : index === 1 ? "取得済み" : null,
  });
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.equal((html.match(/grayscale\(1\)/g) ?? []).length, 2);
  assert.match(html, /相手が選んだ枠/);
  assert.match(html, /取得済み/);
});

test("waiting first picker can still see their picked reward while all selections are disabled", () => {
  const html = renderPanel({
    waitingMessage: "相手が強化を選んでいます",
    choiceDisabledReason: (index) => index === 0 ? "相手が選んだ枠" : null,
    pickedChoiceLabel: "自分が選んだ枠",
  });
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  assert.match(html, /相手が強化を選んでいます/);
  assert.match(html, /自分が選んだ枠/);
});

test("solo reward panel remains selectable without co-op options", () => {
  const html = renderPanel();
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.doesNotMatch(html, /disabled=""|grayscale|選んだ枠/);
});
