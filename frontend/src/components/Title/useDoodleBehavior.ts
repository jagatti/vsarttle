"use client";

import { useEffect, useRef } from "react";
import { encounterSteps, idleStep, reactionStep, restDuration, restingPoses, type DoodleReaction, type DoodlePose } from "./doodleBehavior";

export function useDoodleBehavior(count: number, reaction: DoodleReaction, paused: boolean) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !count) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const actors = Array.from(stage.querySelectorAll<HTMLElement>(".title-doodle-actor"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poses = restingPoses(count);
    let cycles = 0;
    let cancelled = false;

    const apply = (next: DoodlePose[], duration = 0) => {
      poses = next;
      actors.forEach((actor, i) => {
        actor.dataset.action = next[i].action;
        actor.style.setProperty("--doodle-facing", String(next[i].facing));
        actor.style.setProperty("--doodle-duration", `${duration}ms`);
        actor.style.setProperty("--doodle-offset", `${next[i].offset ?? 0}%`);
      });
    };
    const active = () => !cancelled && !paused && !document.hidden && !reducedMotion.matches;
    const schedule = (callback: () => void, delay: number) => {
      if (active()) timer = setTimeout(callback, delay);
    };
    const rest = () => {
      apply(poses.map((pose) => ({ ...pose, action: "rest" })));
      schedule(move, restDuration());
    };
    const move = () => {
      cycles++;
      if (count === 2 && cycles >= 4 && Math.random() < 0.25) {
        cycles = 0;
        const steps = encounterSteps(Math.random() < 0.5, Math.random() < 0.5 ? 0 : 1);
        const next = () => {
          const step = steps.shift();
          if (!step) return rest();
          apply(step.poses, step.duration);
          schedule(next, step.duration);
        };
        next();
      } else {
        const step = idleStep(poses);
        apply(step.poses, step.duration);
        schedule(rest, step.duration);
      }
    };
    const reset = () => {
      clearTimeout(timer);
      apply(restingPoses(count));
      if (reaction && active()) {
        const step = reactionStep(count, reaction);
        apply(step.poses, step.duration);
        schedule(rest, step.duration);
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
      apply(restingPoses(count));
    };
  }, [count, reaction, paused]);

  return stageRef;
}
