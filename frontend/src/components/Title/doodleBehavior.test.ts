import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DrawingSlot } from "@/lib/drawingSlots";
import { drawingToDataUrl } from "@/lib/drawingWire";
import { TitleDoodleStage } from "./TitleDoodleStage";
import { chooseScenario, scenarioSteps, reactionStep, restDuration, restingPoses, selectTitleDoodles, type DoodleScenario } from "./doodleBehavior";

function slot(color: string): DrawingSlot {
  return {
    thumbnail: "data:image/jpeg;base64,thumbnail-not-used",
    drawingData: {
      version: 1,
      canvas: { width: 240, height: 120 },
      layers: [{
        id: "base", name: "base",
        strokes: [{
          id: "pen", tool: "pen", color, size: 4.5,
          points: [{ x: 20.5, y: 10, t: 0 }, { x: 100, y: 110, t: 1 }],
        }],
      }],
    },
  };
}

test("title selects zero, one or two saved transparent images without changing the drawing", () => {
  assert.deepEqual(selectTitleDoodles([null, null, null]), []);
  const saved = slot("#123456");
  const before = structuredClone(saved);
  const images = selectTitleDoodles([null, saved, null]);
  assert.deepEqual(images, [drawingToDataUrl(saved.drawingData)]);
  assert.deepEqual(saved, before);
  const svg = decodeURIComponent(images[0].split(",")[1]);
  assert.match(svg, /viewBox="0 0 240 120"/);
  assert.match(svg, /stroke-width="4.5"/);
  assert.match(svg, /20.5,10/);
  assert.doesNotMatch(svg, /<rect|image\/jpeg/);
});

test("random selection can include every slot and does not duplicate a slot", () => {
  const slots = [slot("#111111"), slot("#222222"), slot("#333333")];
  const original = slots.map((saved) => drawingToDataUrl(saved.drawingData));
  assert.deepEqual(selectTitleDoodles(slots, () => 0.999), original.slice(0, 2));
  const shuffled = selectTitleDoodles(slots, () => 0);
  assert.deepEqual(shuffled, [original[1], original[2]]);
  assert.equal(new Set(shuffled).size, 2);
});

test("blank and malformed saved data are skipped instead of adding a fixed character", () => {
  const blank = slot("#123456");
  blank.drawingData.layers = [];
  const malformed = { drawingData: {}, thumbnail: "" } as DrawingSlot;
  assert.deepEqual(selectTitleDoodles([blank, malformed, null]), []);
  assert.equal(selectTitleDoodles([malformed, slot("#123456"), blank]).length, 1);
});

test("weighted scenarios favor interaction, with a short randomized still interval", () => {
  assert.equal(restDuration(() => 0), 1000);
  assert.equal(restDuration(() => 1), 2800);
  const pair = Array.from({ length: 12 }, (_, i) => chooseScenario(2, () => (i + 0.5) / 12));
  assert.deepEqual(pair, ["spar", "spar", "spar", "spar", "magic", "magic", "chase", "chase", "chase", "visit", "visit", "wander"]);
  const solo = Array.from({ length: 10 }, (_, i) => chooseScenario(1, () => (i + 0.5) / 10));
  assert.deepEqual(solo, ["wander", "wander", "wander", "wander", "visit", "visit", "solo", "solo", "solo", "solo"]);
});

const grounds = [
  { travel: 250, size: 70 },
  { travel: 304, size: 86 },
  { travel: 780, size: 62 },
  { travel: 1792, size: 128 },
];

test("encounters meet, pause, play attack/magic and react before separating", () => {
  for (const ground of grounds) {
    for (const actor of [0, 1]) {
      for (const scenario of ["spar", "magic"] as const) {
        const initial = restingPoses(2);
        const steps = scenarioSteps(scenario, initial, ground, actor, () => 0);
        assert.ok(steps[0].poses.every((pose) => pose.action === "look"));
        const meeting = steps[1].poses;
        assert.ok((meeting[1].position - meeting[0].position) * ground.travel < ground.size);
        assert.ok(steps[3].poses.every((pose) => pose.action === "rest"));
        assert.equal(steps[4].poses[actor].action, scenario === "spar" ? "attack" : "magic");
        assert.equal(steps[5].poses[1 - actor].action, scenario === "spar" ? "retreat" : "hop");
        const end = steps.at(-1)!.poses;
        assert.ok(end[1].position - end[0].position > meeting[1].position - meeting[0].position);
        assert.deepEqual(initial, restingPoses(2));
      }
    }
  }
});

test("all scenarios stay on the ground, move slowly and preserve their ending positions", () => {
  for (const ground of grounds) {
    for (const count of [1, 2]) {
      const scenarios: DoodleScenario[] = count === 2 ? ["spar", "magic", "chase", "visit", "wander"] : ["wander", "visit", "solo"];
      for (const actor of Array.from({ length: count }, (_, i) => i)) {
        for (const scenario of scenarios) {
          for (const random of [() => 0, () => 0.999]) {
            let previous = restingPoses(count);
            const steps = scenarioSteps(scenario, previous, ground, actor, random);
            assert.ok(steps.some((step) => step.poses.every((pose) => pose.action === "rest") && step.duration >= 650));
            for (const step of steps) {
              assert.equal(step.poses.length, count);
              step.poses.forEach((pose, i) => {
                assert.ok(Number.isFinite(pose.position));
                assert.ok(pose.facing === 1 || pose.facing === -1);
                if (scenario !== "visit") assert.ok(pose.position >= 0 && pose.position <= 1);
                if (step.duration > 0) {
                  const speed = Math.abs(pose.position - previous[i].position) * ground.travel / (step.duration / 1000);
                  assert.ok(speed <= 75.001);
                } else {
                  assert.ok(previous[i].position < 0 || previous[i].position > 1 || pose.position === previous[i].position);
                }
              });
              previous = step.poses;
            }
            assert.ok(previous.every((pose) => pose.position >= 0 && pose.position <= 1));
            const next = scenarioSteps("wander", previous, ground, actor, random);
            assert.deepEqual(next[0].poses.map((pose) => pose.position), previous.map((pose) => pose.position));
          }
        }
      }
    }
  }
  assert.deepEqual(scenarioSteps("wander", [], grounds[0]), []);
});

test("visitors fully leave with their shadows, wait briefly and return from either edge", () => {
  for (const ground of grounds) {
    for (const count of [1, 2]) {
      for (const actor of Array.from({ length: count }, (_, i) => i)) {
        for (const random of [() => 0, () => 0.999]) {
          const steps = scenarioSteps("visit", restingPoses(count), ground, actor, random);
          const exit = steps[1].poses[actor].position * ground.travel;
          assert.ok(exit + ground.size < 0 || exit > ground.travel + ground.size);
          assert.ok(steps[2].duration >= 2500 && steps[2].duration < 4500);
          assert.equal(steps[3].duration, 0);
          const entry = steps[3].poses[actor].position;
          assert.ok(random() < 0.5 ? entry < 0 : entry > 1);
          assert.equal(steps.at(-2)!.poses[actor].action, "hop");
        }
      }
    }
  }
});

test("solo scenarios include walks, attacks and magic without needing a partner", () => {
  for (const random of [() => 0, () => 0.999]) {
    const steps = scenarioSteps("solo", restingPoses(1), grounds[0], 0, random);
    assert.ok(steps.some((step) => step.poses[0].action === "walk"));
    assert.ok(steps.some((step) => step.poses[0].action === (random() < 0.5 ? "attack" : "magic")));
  }
});

test("menu reactions work with one or two doodles and do not replace their images", () => {
  for (const count of [1, 2]) {
    assert.ok(reactionStep(count, "single").poses.every((pose) => pose.action === "attack"));
    assert.deepEqual(reactionStep(count, "multi").poses, restingPoses(count).map((pose) => ({ ...pose, action: "look" })));
    assert.ok(reactionStep(count, "profile").poses.every((pose) => pose.action === "look" && pose.facing === 1));
  }
  const current = [{ action: "rest" as const, facing: -1, position: 0.68 }, { action: "rest" as const, facing: 1, position: 0.32 }];
  const reaction = reactionStep(2, "multi", current);
  assert.deepEqual(reaction.poses.map((pose) => pose.position), [0.68, 0.32]);
  assert.deepEqual(reaction.poses.map((pose) => pose.facing), [-1, 1]);
  assert.deepEqual(current.map((pose) => pose.action), ["rest", "rest"]);
});

test("stage stays decorative and frameless in a clipped ground strip below the menu", () => {
  const html = renderToStaticMarkup(createElement(TitleDoodleStage, {
    images: [drawingToDataUrl(slot("#123456").drawingData)], reaction: null, paused: false,
  }));
  assert.match(html, /aria-hidden="true"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /<button|<svg|tabindex/);
  const empty = renderToStaticMarkup(createElement(TitleDoodleStage, { images: [], reaction: null, paused: false }));
  assert.doesNotMatch(empty, /<img|title-doodle-shadow/);
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.title-screen-with-doodles \{[^}]*padding-bottom: calc\(var\(--doodle-size\) \+ 18px\)/);
  assert.match(css, /\.title-doodle-stage \{[^}]*z-index: 0;[^}]*pointer-events: none;/);
  assert.match(css, /\.title-doodle-stage \{[^}]*width: 100vw;[^}]*overflow: hidden;/);
  assert.match(css, /\.title-doodle-lane \{[^}]*width: 100%;/);
  assert.match(css, /\.title-doodle-actor \{[^}]*transform: translateX\(calc\(var\(--doodle-position\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 500px\) \{[\s\S]*?\.title-screen-with-doodles \{[^}]*padding-bottom: calc\(var\(--doodle-size\) \+ 18px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.title-doodle-motion,[^}]*animation: none !important;/);
  assert.doesNotMatch(css, /title-saved-doodle|titleSavedDoodleBreathe/);
  const hook = readFileSync(new URL("./useDoodleBehavior.ts", import.meta.url), "utf8");
  assert.match(hook, /!document.hidden && !reducedMotion.matches/);
  assert.match(hook, /pendingReaction.current && poses.every/);
  assert.match(hook, /if \(reaction\) pendingReaction.current = reaction;/);
  assert.match(hook, /observer.disconnect\(\)/);
  assert.match(css, /\.title-doodle-stage\[data-paused="true"\] \* \{[^}]*animation: none !important;[^}]*transition: none !important;/);
});
