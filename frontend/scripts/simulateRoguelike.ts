import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ROGUELIKE_BATTLE_AIS,
  ROGUELIKE_REWARD_POLICIES,
  simulateRoguelikeRun,
  type RoguelikeBattleAi,
  type RoguelikeRewardPolicy,
  type RoguelikeRunResult,
  type RoguelikeSimulationVariant,
} from "@/lib/roguelikeSimulation";
import { ROGUELIKE_SKILLS, type SkillId } from "@/lib/roguelikeSkills";

// Run from frontend with `npm run roguelike:simulate -- --runs=2000 --seed=20261005`.
// The script writes a reproducible report to docs/roguelike-balance-report.md by default.
const DEFAULT_RUNS = 2_000;
const DEFAULT_SEED = 20_261_005;
const BOSS_FLOORS = [5, 10, 13, 16, 17, 18, 19, 20];

function parseNumberArg(name: string, fallback: number): number {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const value = Number(arg.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

function parseStringArg(name: string, fallback: string): string {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function wilson(successes: number, count: number): [number, number] {
  if (!count) return [0, 0];
  const z = 1.96;
  const p = successes / count;
  const denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

interface Summary {
  policy: RoguelikeRewardPolicy;
  ai: RoguelikeBattleAi;
  variant: string;
  runs: RoguelikeRunResult[];
  clears: RoguelikeRunResult[];
  clearRate: number;
  ci: [number, number];
}

async function runSet(
  policy: RoguelikeRewardPolicy,
  ai: RoguelikeBattleAi,
  runs: number,
  seedStart: number,
  variant?: RoguelikeSimulationVariant,
): Promise<Summary> {
  const results = Array.from({ length: runs }, (_, index) => simulateRoguelikeRun({
    seed: seedStart + index,
    battleAi: ai,
    rewardPolicy: policy,
    variant,
  }));
  const clears = results.filter((result) => result.cleared);
  const ci = wilson(clears.length, results.length);
  return {
    policy,
    ai,
    variant: variant?.name ?? "current",
    runs: results,
    clears,
    clearRate: clears.length / results.length,
    ci,
  };
}

function summaryTable(summaries: Summary[]): string {
  const lines = [
    "| 報酬方針 | ランダムAI | 堅実AI | 戦術AI |",
    "|---|---:|---:|---:|",
  ];
  for (const policy of ROGUELIKE_REWARD_POLICIES) {
    const cells = ROGUELIKE_BATTLE_AIS.map((ai) => {
      const entry = summaries.find((summary) => summary.policy === policy && summary.ai === ai)!;
      return `${percent(entry.clearRate)} (${percent(entry.ci[0])}–${percent(entry.ci[1])})`;
    });
    lines.push(`| ${policy} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function detailedMetrics(summaries: Summary[]): string {
  const lines = [
    "| 報酬方針 | 戦闘AI | 平均到達層 | クリア時残HP / PP | クリア時最大HP / PP / 攻撃 / 防御 / 速度 | ボス突破率（到達者中） | 全回復選択/ラン | 消費回復取得/ラン | 完全勝利数/ラン |",
    "|---|---|---:|---:|---|---|---:|---:|---:|",
  ];
  for (const summary of summaries) {
    const { runs, clears } = summary;
    const bossPasses = BOSS_FLOORS.map((floor) => {
      const reached = runs.filter((run) => run.bossFloorsReached.includes(floor)).length;
      const passed = runs.filter((run) => run.bossFloorsCleared.includes(floor)).length;
      return `${floor}層 ${percent(reached ? passed / reached : 0)} (${passed}/${reached})`;
    }).join("、");
    const stats = (key: "maxHp" | "attack" | "defense" | "speed") => mean(clears.map((run) => run.finalStats[key])).toFixed(0);
    lines.push(`| ${summary.policy} | ${summary.ai} | ${mean(runs.map((run) => run.floorReached)).toFixed(2)} | ${percent(mean(clears.map((run) => run.finalHpRatio)))} / ${percent(mean(clears.map((run) => run.finalPpRatio)))} | ${stats("maxHp")} / ${mean(clears.map((run) => run.finalStats.maxPp)).toFixed(0)} / ${stats("attack")} / ${stats("defense")} / ${stats("speed")} | ${bossPasses} | ${mean(runs.map((run) => run.fullHealUses)).toFixed(2)} | ${mean(runs.map((run) => run.consumableHealUses)).toFixed(2)} | ${mean(runs.map((run) => run.perfectVictories)).toFixed(2)} |`);
  }
  return lines.join("\n");
}

function layerLossTable(summaries: Summary[]): string {
  const lines = [
    "| 報酬方針 | 戦闘AI | " + Array.from({ length: 20 }, (_, index) => `${index + 1}層`).join(" | ") + " |",
    "|---|---|" + Array.from({ length: 20 }, () => "---:").join("|") + "|",
  ];
  for (const summary of summaries) {
    const failures = Array.from({ length: 20 }, (_, index) => {
      const count = summary.runs.filter((run) => !run.cleared && run.floorReached === index + 1).length;
      return percent(count / summary.runs.length);
    });
    lines.push(`| ${summary.policy} | ${summary.ai} | ${failures.join(" | ")} |`);
  }
  return lines.join("\n");
}

function skillAnalysis(summaries: Summary[]): string {
  const tactical = summaries.filter((summary) => summary.ai === "tactical");
  const lines = [
    "| スキル | クリアラン中の取得率 | 取得したランのクリア率 | 取得しないランのクリア率 | 差（参考値） |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const [id, skill] of Object.entries(ROGUELIKE_SKILLS) as [SkillId, typeof ROGUELIKE_SKILLS[SkillId]][]) {
    const runs = tactical.flatMap((summary) => summary.runs);
    const clears = tactical.flatMap((summary) => summary.clears);
    const hasSkill = (run: RoguelikeRunResult) => run.rewardsTaken.some((reward) => reward.kind === "skill" && reward.rewardId === id);
    const acquiredRuns = runs.filter(hasSkill);
    const notAcquiredRuns = runs.filter((run) => !hasSkill(run));
    const acquiredClears = clears.filter(hasSkill).length;
    const noSkillClears = clears.filter((run) => !hasSkill(run)).length;
    const withRate = acquiredRuns.length ? acquiredClears / acquiredRuns.length : 0;
    const withoutRate = notAcquiredRuns.length ? noSkillClears / notAcquiredRuns.length : 0;
    const clearAcquisitions = clears.filter(hasSkill).length;
    lines.push(`| ${skill.label} | ${percent(clearAcquisitions / Math.max(1, clears.length))} | ${percent(withRate)} (${acquiredRuns.length}ラン) | ${percent(withoutRate)} (${notAcquiredRuns.length}ラン) | ${((withRate - withoutRate) * 100).toFixed(1)}pt |`);
  }
  return lines.join("\n");
}

function weakMagicAnalysis(summaries: Summary[]): string {
  const runs = summaries.flatMap((summary) => summary.clears);
  const kinds = ["paralysis", "tieBan", "attackBan", "barrierBan", "magicBan", "chargeBan"];
  return [
    "| 弱まほう | クリア時の取得率 |",
    "|---|---:|",
    ...kinds.map((kind) => `| ${kind} | ${percent(runs.filter((run) => run.acquiredWeakMagicKinds.includes(kind as RoguelikeRunResult["acquiredWeakMagicKinds"][number])).length / Math.max(1, runs.length))} |`),
  ].join("\n");
}

function experimentTable(base: Summary[], experiments: Summary[]): string {
  const lines = ["| 優先度 | シミュレーション上の変更 | 報酬方針 | 戦術AIクリア率 (95% CI) | 現行との差 |", "|---:|---|---|---:|---:|"];
  const priority = (entry: Summary) => entry.variant.includes("敵攻撃") ? 1
    : entry.variant.includes("ボス全回復") ? 2
    : entry.variant.includes("HP自動回復") ? 3
    : entry.variant.includes("回復保証") ? 4
    : 5;
  for (const entry of [...experiments].sort((left, right) => priority(left) - priority(right))) {
    const current = base.find((summary) => summary.policy === entry.policy && summary.ai === "tactical")!;
    lines.push(`| ${priority(entry)} | ${entry.variant} | ${entry.policy} | ${percent(entry.clearRate)} (${percent(entry.ci[0])}–${percent(entry.ci[1])}) | ${(100 * (entry.clearRate - current.clearRate)).toFixed(1)}pt |`);
  }
  return lines.join("\n");
}

function topObservedSkill(summaries: Summary[]): string {
  const tactical = summaries.filter((summary) => summary.ai === "tactical");
  const runs = tactical.flatMap((summary) => summary.runs);
  const skills = Object.keys(ROGUELIKE_SKILLS) as SkillId[];
  const candidates = skills.map((id) => {
    const group = runs.filter((run) => run.rewardsTaken.some((reward) => reward.kind === "skill" && reward.rewardId === id));
    return { id, label: ROGUELIKE_SKILLS[id].label, rate: group.length ? group.filter((run) => run.cleared).length / group.length : 0, count: group.length };
  }).sort((a, b) => b.rate - a.rate);
  const best = candidates[0];
  return best ? `${best.label}取得ランのクリア率は${percent(best.rate)}（n=${best.count}）。方針差を含む観察的な関連で、因果効果ではありません。` : "スキル取得の観測ランなし。";
}

async function main() {
  const runs = parseNumberArg("runs", DEFAULT_RUNS);
  const seedStart = parseNumberArg("seed", DEFAULT_SEED);
  const outputPath = resolve(process.cwd(), parseStringArg("out", "../docs/roguelike-balance-report.md"));
  const reportDate = new Date().toISOString().slice(0, 10);
  const baseline: Summary[] = [];
  for (const policy of ROGUELIKE_REWARD_POLICIES) {
    for (const ai of ROGUELIKE_BATTLE_AIS) {
      baseline.push(await runSet(policy, ai, runs, seedStart));
      const latest = baseline[baseline.length - 1]!;
      console.log(`${policy} / ${ai}: ${percent(latest.clearRate)} (${latest.clears.length}/${runs})`);
    }
  }

  const variants: RoguelikeSimulationVariant[] = [
    { name: "敵攻撃力 +15%", enemyAttackMultiplier: 1.15 },
    { name: "HP自動回復 5%→3%", hpRegenRatio: 0.03 },
    { name: "ボス全回復 HP60% + PP全回復", bossHealRatio: 0.6 },
    { name: "HP70%未満なら通常報酬2枠目に回復保証", lowHpRewardHealThreshold: 0.7 },
    { name: "ステータス強化量 +25%", statUpgradeMultiplier: 1.25 },
  ];
  const experiments: Summary[] = [];
  for (const variant of variants) {
    for (const policy of ["no-stat", "skill-first", "heal-aware"] as const) {
      const result = await runSet(policy, "tactical", runs, seedStart, variant);
      experiments.push(result);
      console.log(`${variant.name} / ${policy} / tactical: ${percent(result.clearRate)} (${result.clears.length}/${runs})`);
    }
  }

  const target = experiments.find((entry) => {
    if (entry.policy !== "heal-aware" || entry.clearRate < 0.3 || entry.clearRate > 0.5) return false;
    const noStat = experiments.find((candidate) => candidate.variant === entry.variant && candidate.policy === "no-stat")!;
    const skillFirst = experiments.find((candidate) => candidate.variant === entry.variant && candidate.policy === "skill-first")!;
    return noStat.clearRate <= 0.15 && skillFirst.clearRate <= 0.15;
  });
  const currentRuns = (policy: RoguelikeRewardPolicy) => baseline.find((entry) => entry.policy === policy && entry.ai === "tactical")!;
  const noStatCurrent = currentRuns("no-stat");
  const skillFirstCurrent = currentRuns("skill-first");
  const healAwareCurrent = currentRuns("heal-aware");
  const statOnlyCurrent = currentRuns("stat-only");
  const earlyNoStatFailures = noStatCurrent.runs.filter((run) => !run.cleared && run.floorReached <= 2).length / runs;
  const targetMessage = target
    ? `候補セット「${target.variant}」は heal-aware ${percent(target.clearRate)}、no-stat ${percent(experiments.find((entry) => entry.variant === target.variant && entry.policy === "no-stat")!.clearRate)}、skill-first ${percent(experiments.find((entry) => entry.variant === target.variant && entry.policy === "skill-first")!.clearRate)}。指定目安を同時に満たすため、調整候補として推奨する（本体適用前にプレイテスト）。`
    : "試した候補のいずれも heal-aware 3〜5割、no-stat/skill-first 各1.5割以下を同時に満たさなかった。現時点で目標セットを断定せず、表の差と信頼区間を見て追加の組み合わせ試験を行う。";
  const analysis = [
    "## 数値から見た分析と調整案",
    "",
    `- 現行条件の戦術AIでは ${topObservedSkill(baseline)}`,
    `- ボス全回復の平均選択数は heal-aware 戦術AIで ${mean(baseline.find((entry) => entry.policy === "heal-aware" && entry.ai === "tactical")!.runs.map((run) => run.fullHealUses)).toFixed(2)} 回/ラン。スキル消費回復は ${mean(baseline.find((entry) => entry.policy === "heal-aware" && entry.ai === "tactical")!.runs.map((run) => run.consumableHealUses)).toFixed(2)} 回/ラン。最大HP増加による回復と完全勝利時の最大値回復も存在するため、HP引継ぎだけでは消耗が十分な制約にならない可能性を検証対象とする。`,
    "- 「どの要因が原因か」は単独要因を無作為化していない比較から断定しない。スキル別クリア率差は方針・生存者バイアスを含む参考関連として掲載。",
    `- 戦術AIの現行結果は heal-aware ${percent(healAwareCurrent.clearRate)}、no-stat ${percent(noStatCurrent.clearRate)}、skill-first ${percent(skillFirstCurrent.clearRate)}、報酬なし ${percent(currentRuns("baseline").clearRate)}。stat-only は ${percent(statOnlyCurrent.clearRate)}。no-stat は ${percent(earlyNoStatFailures)} が2層までに脱落し、全回復を平均 ${mean(noStatCurrent.runs.map((run) => run.fullHealUses)).toFixed(2)} 回/ランしか選べなかったため、このAI/方針条件ではボス報酬の全回復に到達する前の序盤消耗が主なボトルネック。これはプレイヤー操作の再現ではなく、敵火力や回復量が過剰/不足と断定する根拠ではない。`,
    "",
    "### 調整候補を同じシミュレータで再試行（戦術AI）",
    "",
    "優先度は原因に近い順の検証順。ベース方針のクリア率が0%の条件では差が出ず、変更効果を判定できない。",
    "",
    experimentTable(baseline, experiments),
    "",
    "### 目標と推奨セット",
    "",
    targetMessage,
    "",
    "報酬なしベースライン、no-stat、skill-first の結果を比較し、スキルのみで目標1割前後を満たす案があるかを確認する。範囲内候補が無い場合、今回の試行だけで推奨セットを断定しない。",
  ].join("\n");

  const report = [
    "# ローグライク20層バランスシミュレーション",
    "",
    "- 実行日: " + reportDate,
    "- 1条件あたり: " + runs.toLocaleString() + "ラン。固定seed開始値: " + seedStart,
    "- 95%信頼区間: Wilson score interval",
    "- 使い方: `cd frontend && npm run roguelike:simulate -- --runs=2000 --seed=20261005`。`--out=../docs/roguelike-balance-report.md` で出力先を変更。",
    "- 本レポートは計測・提案のみ。ゲーム本体のバランス定数・ロジックは変更していない。",
    "",
    "## 方針別クリア率",
    "",
    "セルはクリア率（95% CI）。クリアは20層ボス撃破。",
    "",
    summaryTable(baseline),
    "",
    "## 到達・クリア時指標とボス突破率",
    "",
    "ボス突破率は各層に到達したランを分母とする。到達層は敗北した層、クリア時は20。",
    "",
    detailedMetrics(baseline),
    "",
    "## 層ごとの脱落率",
    "",
    "各セルは全ラン中、その層で敗北した割合（%）。20層到達後のクリアは脱落に含めない。",
    "",
    layerLossTable(baseline),
    "",
    "## クリアランのスキル取得とクリア率の関係",
    "",
    "下表は全報酬方針の戦術AIランをまとめた観察値。消費スキルは取得後に記録から消えても、取得イベントをカウントする。因果効果ではない。",
    "",
    skillAnalysis(baseline),
    "",
    "### 弱まほう取得率（クリアラン）",
    "",
    weakMagicAnalysis(baseline),
    "",
    analysis,
    "",
    "## シミュレーションの前提と乖離",
    "",
    "- 戦闘は実際の `resolveTurn` を呼び、敵CPUには `pickGhostCpuAction` と型別ウェイトを使う。弱まほう、スキル、ボス戦パラメータ、20層のdamageCaps、床移動、完全勝利、報酬生成・適用はゲーム側の関数を利用。",
    "- 通常敵は指定どおりゴーストを使わず、`buildWeakEnemyStats` の攻撃/魔法/防御/バランス型から等確率で合成。プレイヤーもゲーム仕様どおりbalanced。",
    "- プレイヤーAIはランダム、直前の敵行動を使う堅実型、より積極的にカウンターする戦術型。人間の操作・敵のゴースト個性・通信/演出待ちを再現しない。",
    "- 1戦80ターンで安全打ち切り。仮に到達した場合はその層の敗北として計上。ボス固有処理は `resolveTurn` の現在の実装に依存。",
    "- 実験条件はシミュレーション引数での上書きだけ。HP自動回復3%は通常の5%回復をシミュレーション側で置き換え、ボス全回復60%はHPのみ60%・PP全回復、敵攻撃+15%とステータス強化+25%は生成/報酬の値だけ、HP70%未満での回復保証は通常報酬第2枠の抽選条件だけに適用。",
    "",
  ].join("\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");
  console.log(`Report written to ${outputPath}`);
}

void main();
