"use client";

import { useEffect, useMemo, useState } from "react";
import { getAvailableActions } from "@/lib/battleLogic";
import type { ActionType, PlayerBattleState, TurnResult } from "@/types/game";

const ACTION_LABELS: Record<ActionType, string> = {
  attack: "こうげき",
  magicWeak: "弱まほう",
  magicStrong: "強まほう",
  barrier: "バリア",
  charge: "チャージ",
};

const safeImageUrl = (value: string) => (value.startsWith("data:image/") ? value : "");

export function BattlePanel(props: {
  me: PlayerBattleState;
  enemy: PlayerBattleState;
  turnResult: TurnResult | null;
  countdown: number;
  onActionSelect: (action: ActionType) => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const availableActions = useMemo(() => getAvailableActions(props.me), [props.me]);

  useEffect(() => {
    setSelectedAction(null);
  }, [props.me.lastActionCategory, props.countdown]);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-xl font-bold">バトル（残り {props.countdown} 秒）</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {[props.me, props.enemy].map((player) => (
          <article key={player.id} className="rounded border p-3">
            <h3 className="font-semibold">{player.nickname}</h3>
            <img
              src={safeImageUrl(player.imageDataUrl)}
              alt={`${player.nickname} のキャラクター`}
              className="my-2 h-32 w-32 rounded border bg-white object-contain"
            />
            <p>HP: {player.currentHp}/{player.stats.maxHp}</p>
            <p>PP: {player.currentPp}/{player.stats.maxPp}</p>
            <p>攻: {player.stats.attack} / 防: {player.stats.defense}</p>
            <p>速: {player.stats.speed} / 回避: {Math.round(player.stats.evasion * 100)}%</p>
          </article>
        ))}
      </div>
      <div>
        <p className="mb-1 text-sm">前回行動: {props.me.lastActionCategory ?? "なし"}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACTION_LABELS) as ActionType[]).map((action) => {
            const selectable = availableActions.includes(action);
            return (
              <button
                key={action}
                className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-gray-200"
                disabled={!selectable}
                onClick={() => {
                  setSelectedAction(action);
                  props.onActionSelect(action);
                }}
              >
                {ACTION_LABELS[action]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-gray-600">選択中: {selectedAction ? ACTION_LABELS[selectedAction] : "未選択"}</p>
      </div>
      {props.turnResult && (
        <div className="rounded bg-gray-100 p-3 text-sm">
          <p className="font-semibold">ターン {props.turnResult.turn} 結果</p>
          <p>
            あなた: {ACTION_LABELS[props.turnResult.actions[props.me.id]]} / 相手: {ACTION_LABELS[props.turnResult.actions[props.enemy.id]]}
          </p>
          <ul className="list-disc pl-5">
            {props.turnResult.damageEvents.map((event, index) => (
              <li key={`${event.from}-${event.to}-${index}`}>
                {event.avoided ? "回避成功" : `${event.reason}: ${event.amount} ダメージ`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">まほうは最大PPに対する割合（弱20% / 強40%）で消費されます。</p>
        </div>
      )}
      {props.me.lastActionCategory && <p className="text-xs text-gray-500">同カテゴリ行動は次ターン選択不可: {props.me.lastActionCategory}</p>}
    </section>
  );
}
