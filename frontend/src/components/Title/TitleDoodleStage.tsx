"use client";

import Image from "next/image";
import type { DoodleReaction } from "./doodleBehavior";
import { useDoodleBehavior } from "./useDoodleBehavior";

export function TitleDoodleStage({ images, reaction, paused }: {
  images: string[];
  reaction: DoodleReaction;
  paused: boolean;
}) {
  const stageRef = useDoodleBehavior(images.length, reaction, paused);
  return (
    <div ref={stageRef} className="title-doodle-stage" aria-hidden="true">
      {images.map((image, index) => (
        <div className={`title-doodle-lane title-doodle-lane-${index + 1}`} key={image + index}>
          <div className="title-doodle-actor" data-action="rest">
            <span className="title-doodle-shadow" />
            <div className="title-doodle-motion">
              <div className="title-doodle-facing">
                <Image className="title-doodle-image" src={image} alt="" draggable={false}
                  width={120} height={120} unoptimized
                  onError={(event) => {
                    const actor = event.currentTarget.closest<HTMLElement>(".title-doodle-actor");
                    if (actor) actor.hidden = true;
                  }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
