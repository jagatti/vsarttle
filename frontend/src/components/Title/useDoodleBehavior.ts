"use client";

import { useEffect, useRef } from "react";
import { chooseScenario, scenarioSteps, reactionStep, restDuration, restingPoses, type DoodleReaction, type DoodlePose, type DoodleStep } from "./doodleBehavior";

export function useDoodleBehavior(count: number, reaction: DoodleReaction, paused: boolean) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pendingReaction = useRef<DoodleReaction>(null);

  useEffect(() => {
    pendingReaction.current = reaction;
  }, [reaction]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !count) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const actors = Array.from(stage.querySelectorAll<HTMLElement>(".title-doodle-actor"));
    const ground = { travel: 1, size: 1 };
    const measure = () => {
      ground.size = actors[0]?.offsetWidth ?? 1;
      ground.travel = Math.max(1, stage.clientWidth - ground.size);
      stage.style.setProperty("--doodle-travel", `${ground.travel}px`);
    };
    measure();
    const observer = new ResizeObserver(() => {
      measure();
      reset();
    });
    observer.observe(stage);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poses = restingPoses(count);
    let steps: DoodleStep[] = [];
    let cancelled = false;

    const apply = (next: DoodlePose[], duration = 0) => {
      poses = next;
      actors.forEach((actor, i) => {
        actor.dataset.action = next[i].action;
        actor.style.setProperty("--doodle-facing", String(next[i].facing));
        actor.style.setProperty("--doodle-duration", `${duration}ms`);
        actor.style.setProperty("--doodle-position", String(next[i].position));
      });
      // Commit invisible edge changes before starting the return walk.
      if (duration === 0) void stage.offsetWidth;
    };
    const active = () => !cancelled && !paused && !document.hidden && !reducedMotion.matches;
    const schedule = (callback: () => void, delay: number) => {
      if (active()) timer = setTimeout(callback, delay);
    };
    const rest = () => {
      apply(poses.map((pose) => ({ ...pose, action: "rest" })));
      schedule(move, restDuration());
    };
    const next = () => {
      if (pendingReaction.current && poses.every((pose) => pose.position >= 0 && pose.position <= 1)) {
        const step = reactionStep(count, pendingReaction.current, poses);
        pendingReaction.current = null;
        apply(step.poses, step.duration);
        schedule(next, step.duration);
        return;
      }
      const step = steps.shift();
      if (!step) return rest();
      apply(step.poses, step.duration);
      schedule(next, step.duration);
    };
    const move = () => {
      steps = scenarioSteps(chooseScenario(count), poses, ground, Math.floor(Math.random() * count));
      next();
    };
    const reset = () => {
      clearTimeout(timer);
      steps = [];
      stage.dataset.paused = String(!active());
      apply(restingPoses(count));
      if (pendingReaction.current && active()) {
        next();
      } else {
        schedule(move, restDuration());
      }
    };
    reset();
    document.addEventListener("visibilitychange", reset);
    reducedMotion.addEventListener("change", reset);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", reset);
      reducedMotion.removeEventListener("change", reset);
      observer.disconnect();
      stage.dataset.paused = "true";
      apply(restingPoses(count));
    };
  }, [count, paused]);

  return stageRef;
}
