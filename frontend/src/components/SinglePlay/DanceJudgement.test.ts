import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DanceJudgement, type DanceJudgementKind } from "./DanceJudgement";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const source = readFileSync(new URL("./DanceBattleMiniGame.tsx", import.meta.url), "utf8");
const render = (kind: DanceJudgementKind, text: string, className = "") =>
  renderToStaticMarkup(createElement(DanceJudgement, { kind, className }, text));
const ruleFor = (selector: string) => {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) =>
    match[1].split(",").some((entry) => entry.trim() === selector));
  assert.ok(rule, `missing CSS rule for ${selector}`);
  return rule[2];
};

test("judgement names and outcome kinds share the same gradient classes", () => {
  for (const name of ["PERFECT", "GREAT", "GOOD", "BAD", "MISS"] as const) {
    assert.equal(render(name, name), render(name.toLowerCase() as DanceJudgementKind, name));
    assert.match(render(name, name), /class="dance-judgement-text dance-judgement-/);
  }
  const perfect = ruleFor(".dance-judgement-perfect");
  const good = ruleFor(".dance-judgement-good");
  const bad = ruleFor(".dance-judgement-bad");
  assert.equal(ruleFor(".dance-judgement-fever-best"), perfect);
  assert.equal(ruleFor(".dance-judgement-fever-middle"), good);
  assert.equal(ruleFor(".dance-judgement-great"), good);
  assert.equal(ruleFor(".dance-judgement-fever-low"), bad);
  assert.equal(ruleFor(".dance-judgement-miss"), bad);
  assert.match(perfect, /linear-gradient\(#29c9ff, #b5fcff\)/);
  assert.match(good, /linear-gradient\(#74db68, #eaff6a\)/);
  assert.match(bad, /linear-gradient\(#ff513e, #ff9b42\)/);
});

test("points and fever results render once as a single gradient text run", () => {
  for (const [kind, text] of [
    ["PERFECT", "PERFECT +13"],
    ["GREAT", "GREAT +10"],
    ["GOOD", "GOOD +8"],
    ["BAD", "BAD +5"],
    ["MISS", "MISS -5"],
    ["fever-best", "🔥⑧104"],
    ["fever-middle", "🔥④52"],
    ["fever-low", "🔥⓪0"],
  ] as const) {
    for (const location of ["dance-points", "dance-lane-judgement", ""]) {
      const markup = render(kind, text, location);
      assert.equal((markup.match(/<strong\b/g) ?? []).length, 1);
      assert.ok(markup.endsWith(`>${text}</strong>`));
      assert.ok(markup.includes(`dance-judgement-${kind.toLowerCase()}`));
    }
  }
  const memberSource = source.slice(source.indexOf("const renderMember ="), source.indexOf("const renderBackline ="));
  assert.equal((memberSource.match(/<DanceJudgement\b/g) ?? []).length, 1);
  assert.match(memberSource, /className=\{feverLabel \|\| outcome \? "dance-points" : "dance-judgement"\}/);
  assert.doesNotMatch(source, /<strong[^>]*className=["`][^"`]*dance-(?:points|judgement|lane-judgement)/);
  assert.match(source, /<DanceJudgement kind=\{lastJudgment\}>/);
  assert.match(source, /<DanceJudgement kind=\{activeFeverKind\}>/);
});

test("overhead points remain visible until round state clears them while input judgements still float", () => {
  const points = ruleFor(".dance-points");
  assert.doesNotMatch(points, /(?:animation|opacity|visibility|display):/);
  assert.match(points, /transform: translateX\(-50%\)/);
  assert.match(ruleFor(".dance-judgement"), /animation: danceJudgementFloat 900ms ease-out forwards/);
  for (const kind of ["PERFECT", "MISS", "fever-best", "fever-middle", "fever-low"] as const) {
    const markup = render(kind, "points", "dance-points");
    const classes = markup.match(/class="([^"]+)"/)?.[1].split(" ") ?? [];
    assert.ok(classes.includes("dance-points"));
    assert.ok(!classes.includes("dance-judgement"));
  }
});

test("gradient text has a glyph-only dark outline and no judgement panels", () => {
  const shared = ruleFor(".dance-judgement-text");
  assert.match(shared, /background-clip: text/);
  assert.match(shared, /-webkit-text-fill-color: transparent/);
  assert.match(shared, /filter: drop-shadow\(1px 0 0 #171923\)/);
  assert.match(shared, /drop-shadow\(-1px 0 0 #171923\)/);
  assert.match(shared, /drop-shadow\(0 1px 0 #171923\)/);
  assert.match(shared, /drop-shadow\(0 -1px 0 #171923\)/);
  for (const selector of [".dance-points", ".dance-judgement", ".dance-lane-judgement", ".dance-judgement-text"]) {
    assert.doesNotMatch(ruleFor(selector), /(?:background(?:-color)?|border(?:-radius)?|padding):/);
  }
  assert.match(ruleFor(".dance-judgement"), /animation: danceJudgementFloat 900ms ease-out forwards/);
  assert.match(ruleFor(".dance-play-controls"), /background: rgba/);
  assert.match(ruleFor(".dance-lane"), /background: rgba/);
});
