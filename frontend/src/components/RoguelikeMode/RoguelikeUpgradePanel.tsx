"use client";

import { ROGUELIKE_PLAYER_INITIAL_STATS, type UpgradeStatKey } from "@/lib/roguelikeEnemyStats";
import {
  buildRoguelikeSkillLabels,
  buildRoguelikeSkillsTooltip,
  type AcquiredSkills,
} from "@/lib/roguelikeSkills";
import type {
  RoguelikeBossUpgradeChoice,
  RoguelikeSkillUpgradeSlot,
  RoguelikeUpgradeRarity,
} from "@/lib/roguelikeUpgrades";
import type { PlayerBattleState, WeakMagicEffectKind } from "@/types/game";

export type RoguelikeUpgradeChoice =
  | { kind: "weak-stat"; rarity: 1 | 2; key: UpgradeStatKey; amount: number }
  | { kind: "weak-magic"; rarity: 3; effectKind: WeakMagicEffectKind; effectName: string }
  | RoguelikeSkillUpgradeSlot
  | RoguelikeBossUpgradeChoice
  | { kind: "revival"; label: string };

export interface RoguelikeUpgradePanelProps<Choice extends RoguelikeUpgradeChoice = RoguelikeUpgradeChoice> {
  floor: number;
  player: PlayerBattleState;
  acquiredSkills: AcquiredSkills;
  acquiredHealingSkills?: AcquiredSkills;
  choices: readonly Choice[];
  onSelect: (choice: Choice, index: number) => void;
  countdown?: number;
  waitingMessage?: string;
  choiceDisabledReason?: (index: number) => string | null;
  pickedChoiceLabel?: string;
}

const UPGRADE_LABELS: Record<UpgradeStatKey, string> = {
  hp: "HP",
  pp: "PP",
  attack: "攻撃",
  defense: "防御",
  speed: "速度",
  evasion: "回避",
};

function formatUpgradeAmount(key: UpgradeStatKey, amount: number): string {
  if (key === "evasion") return `+${Math.round(amount * 100)}%`;
  return `+${amount}`;
}

export function RoguelikeUpgradePanel<Choice extends RoguelikeUpgradeChoice>({
  floor,
  player,
  acquiredSkills,
  acquiredHealingSkills,
  choices,
  onSelect,
  countdown,
  waitingMessage,
  choiceDisabledReason,
  pickedChoiceLabel,
}: RoguelikeUpgradePanelProps<Choice>) {
  const playerStats = player.stats;
  const skillsTooltip = buildRoguelikeSkillsTooltip(acquiredSkills);
  const skillsSummary = buildRoguelikeSkillLabels(acquiredSkills, player.roguelikeGutsUsed, acquiredHealingSkills).join("、");
  const init = ROGUELIKE_PLAYER_INITIAL_STATS;
  const statsDisplay: { label: string; value: string }[] = [
    { label: "HP",   value: `${playerStats.maxHp}(+${playerStats.maxHp - init.maxHp})` },
    { label: "PP",   value: `${playerStats.maxPp}(+${playerStats.maxPp - init.maxPp})` },
    { label: "攻撃", value: `${playerStats.attack}(+${playerStats.attack - init.attack})` },
    { label: "防御", value: `${playerStats.defense}(+${playerStats.defense - init.defense})` },
    { label: "速度", value: `${playerStats.speed}(+${playerStats.speed - init.speed})` },
    { label: "回避", value: `${Math.round(playerStats.evasion * 100)}%(+${Math.round((playerStats.evasion - init.evasion) * 100)}%)` },
  ];
  const rarityMeta: Record<RoguelikeUpgradeRarity, { stars: string; color: string; label: string }> = {
    1: { stars: "★", color: "#2563eb", label: "★1" },
    2: { stars: "★★", color: "#16a34a", label: "★2" },
    3: { stars: "★★★", color: "#7c3aed", label: "★3" },
  };

  return (
    <section className="max-h-[calc(100dvh-40px)] w-full max-w-4xl overflow-y-auto rounded-lg border border-amber-500/40 bg-slate-900/95 p-6 text-amber-50">
      <div className="text-center">
        <div className="text-sm text-amber-200">第{floor}層クリア！</div>
        <h2 className="mt-2 text-2xl font-black">強化を選択</h2>
        {countdown !== undefined && (
          <div role="status" className="mt-2 text-sm text-amber-200">残り {countdown} 秒</div>
        )}
        {waitingMessage && (
          <div role="status" className="mt-2 text-sm text-cyan-200">{waitingMessage}</div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-slate-300">
        {statsDisplay.map((s) => (
          <span key={s.label} className="rounded bg-slate-800/60 px-2 py-1">
            {s.label}{s.value}
          </span>
        ))}
      </div>
      <div title={skillsTooltip} className="mt-3 text-center text-xs text-cyan-200">
        スキル: {skillsSummary || "未習得"}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {choices.map((choice, index) => {
          const rarity = choice.kind === "weak-stat" || choice.kind === "weak-magic" || choice.kind === "skill" ? choice.rarity : null;
          const rarityStyle = rarity ? rarityMeta[rarity] : null;
          const disabledReason = choiceDisabledReason?.(index);
          const disabled = !!waitingMessage || !!disabledReason;
          return (
            <button
              key={`${choice.kind}-${index}`}
              disabled={disabled}
              onClick={() => onSelect(choice, index)}
              style={{
                borderRadius: 14,
                border: `2px solid ${rarityStyle?.color ?? "#f59e0b"}`,
                background:
                  rarityStyle
                    ? `linear-gradient(135deg, ${rarityStyle.color}66, rgba(15,23,42,0.95))`
                    : "linear-gradient(135deg, rgba(120,53,15,0.85), rgba(217,119,6,0.25))",
                padding: "20px 18px",
                textAlign: "left",
                cursor: disabled ? "default" : "pointer",
                ...(disabledReason ? { filter: "grayscale(1)", opacity: 0.5 } : {}),
                boxShadow: `0 0 18px ${rarityStyle?.color ?? "#f59e0b"}55`,
              }}
            >
              <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                <span>
                  {choice.kind === "revival" ? "復活報酬" : choice.kind === "skill" ? "✨ スキル報酬" : rarity ? "成長スロット" : floor === 17 ? "ボス撃破報酬(17層)" : "ボス撃破報酬"}
                </span>
                {rarityStyle && <span style={{ color: rarityStyle.color }}>{rarityStyle.stars}</span>}
              </div>
              {disabledReason && (
                <div className="mt-2 text-sm font-bold">
                  {disabledReason === "相手が選んだ枠" ? pickedChoiceLabel ?? disabledReason : disabledReason}
                </div>
              )}
              <div style={{ color: "#fff7ed", fontSize: 22, fontWeight: 900, marginTop: 8 }}>
                {choice.kind === "boss-multiply" || choice.kind === "full-heal" || choice.kind === "skill" || choice.kind === "revival"
                  ? choice.label
                  : choice.kind === "weak-magic"
                  ? `🪄 ${choice.effectName}`
                  : UPGRADE_LABELS[choice.key]}
              </div>
              <div style={{ color: "#fed7aa", fontSize: 14, marginTop: 8 }}>
                {choice.kind === "revival"
                  ? "現在HPの33%を消費（最低HP1）。味方はHP/PP50%で復活"
                  : choice.kind === "full-heal"
                  ? "クリックしてHPとPPを最大値まで回復"
                  : choice.kind === "skill"
                  ? choice.description
                  : choice.kind === "boss-multiply"
                  ? choice.healRatio
                    ? "強化を適用し、HPとPPを最大値の50%回復"
                    : "クリックして強化を適用"
                  : choice.kind === "weak-magic"
                  ? `${rarityStyle?.label} 弱まほう効果を習得`
                  : `${rarityStyle?.label} ${formatUpgradeAmount(choice.key, choice.amount)}`}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
