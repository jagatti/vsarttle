"use client";

import { MINI_GAME_REGISTRY } from "./miniGameRegistry";
import { soundManager } from "@/lib/soundManager";

export function MiniGameSelectScreen(props: { onSelect: (id: string) => void; onBack: () => void }) {
  return (
    <section className="difficulty-screen mini-game-screen" aria-labelledby="mini-game-heading">
      <h2 id="mini-game-heading" className="difficulty-heading">ミニゲームを選択</h2>
      <div className="mini-game-cards">
        {MINI_GAME_REGISTRY.map((game) => (
          <button
            key={game.id}
            className="mini-game-card"
            onClick={() => {
              soundManager.playSe("/sounds/se/button.mp3");
              props.onSelect(game.id);
            }}
          >
            <span className="mini-game-icon" aria-hidden="true">{game.icon}</span>
            <span className="mini-game-name">{game.name}</span>
            <span className="mini-game-description">{game.description}</span>
          </button>
        ))}
      </div>
      <button
        className="title-menu-button difficulty-back"
        onClick={() => {
          soundManager.playSe("/sounds/se/button.mp3");
          props.onBack();
        }}
      >
        シングルプレイへ戻る
      </button>
    </section>
  );
}
