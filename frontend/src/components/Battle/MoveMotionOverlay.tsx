"use client";

import { useId } from "react";
import type { CSSProperties } from "react";
import type { TurnDamageEvent } from "@/types/game";
import type { MoveMotionType, TurnAnimationPhase } from "./battleAnimationPhases";
import type { getFinalBossEffect } from "./bossPresentation";

export function FinalBossAuraEffect({
  effect,
  charged,
}: {
  effect: ReturnType<typeof getFinalBossEffect>;
  charged: boolean;
}) {
  if (!effect && !charged) return null;
  return (
    <div className="final-boss-aura" data-effect={effect ?? "charged"} aria-hidden="true">
      <span className="final-boss-ring" />
      <span className="final-boss-ring final-boss-ring-inner" />
      {effect && Array.from({ length: effect === "magicStrong" ? 8 : 4 }, (_, index) => (
        <i key={index} style={{ "--particle-angle": `${index * (360 / (effect === "magicStrong" ? 8 : 4))}deg` } as CSSProperties} />
      ))}
    </div>
  );
}

/**
 * わざモーション用のエフェクト群（ラクガキ風）。見た目は app/battle-effects.css に定義する。
 *
 * PortraitBlock の `.fx-stage`（`--fx-size` = ポートレートの大きさ、`--dir` = 相手の方向）の中に置く。
 * - `.fx-mirror` の中は「右向き」で描き、左右は CSS で反転する。座標は `--u`（ポートレートの 1/120）単位。
 * - アクター側のエフェクトはフェーズ開始時に、ターゲット側のヒット演出（ImpactEffect）は
 *   当たった瞬間（battleAnimationPhases.ts の getPhaseImpactDelayMs）に BattlePanel から表示する。
 */

export type BattleSide = "left" | "right";

export function getMotionDirection(side: BattleSide): 1 | -1 {
  return side === "left" ? 1 : -1;
}

/** 2.25 倍以上のチャージは金色の「オーバーチャージ」演出にする */
export const OVERCHARGE_MULTIPLIER = 2.25;

export interface PortraitAnimationOptions {
  /** チャージ中のこうげき（ためが深く、ヒットストップが長い） */
  charged?: boolean;
  /** オーバーチャージ（2.25 倍以上） */
  overcharged?: boolean;
  /** 強まほう（浮き上がって溜める） */
  strong?: boolean;
}

/**
 * 向きは `--dir` で切り替え、左右共通のポーズ animation を返す。
 * ヒットの瞬間は battleAnimationPhases.ts の MOTION_IMPACT_DELAY_MS と揃えている。
 */
export function getPortraitAnimation(
  motionType: MoveMotionType,
  _side: BattleSide,
  active: boolean,
  options: PortraitAnimationOptions = {},
): string {
  if (!active) return "";
  switch (motionType) {
    case "attackLunge":
      return `${options.charged ? "attackLungeCharged" : "attackLunge"} 850ms ease-out both`;
    case "chargeConcentration":
      return `${options.overcharged ? "chargeConcentrationOver" : "chargeConcentration"} 800ms ease-out both`;
    case "magicBlast":
    case "magicReflect":
      return `${options.strong ? "magicCastStrong" : "magicCast"} 850ms ease-out both`;
    case "barrierWall":
    case "barrierBreak":
    case "barrierClash":
      return "barrierBrace 750ms ease-out both";
    case "barrierBash":
      return "barrierBash 850ms ease-out both";
    default:
      return "";
  }
}

export function getPortraitMotionStyle(
  motionType: MoveMotionType,
  side: BattleSide,
  active: boolean,
  chargeMultiplier = 1,
  sourceActionType?: string,
) {
  return {
    animation: getPortraitAnimation(motionType, side, active, {
      charged: chargeMultiplier > 1,
      overcharged: chargeMultiplier >= OVERCHARGE_MULTIPLIER,
      strong: sourceActionType === "magicStrong",
    }),
    "--dir": getMotionDirection(side),
    "--motion-power": chargeMultiplier > 1 ? 1.4 : 1,
  };
}

/** 被弾: 当たった瞬間に「くの字」で止まり、ふっとんで戻る */
export function getHitPortraitAnimation(_side: BattleSide, active: boolean, heavy = false): string {
  if (!active) return "";
  return heavy ? "hitRecoilHeavy 640ms ease-out both" : "hitRecoil 560ms ease-out both";
}

export function getHitPortraitStyle(side: BattleSide, active: boolean, heavy = false) {
  return {
    animation: getHitPortraitAnimation(side, active, heavy),
    "--dir": side === "left" ? -1 : 1,
    "--hit-distance": heavy ? "44px" : "24px",
    "--hit-angle": heavy ? "22deg" : "14deg",
  };
}

/** ヒット演出の種類（当たった瞬間にターゲット側へ出す） */
export type ImpactKind =
  | "attack"
  | "attackCharged"
  | "magicWeak"
  | "magicStrong"
  | "reflect"
  | "bash"
  | "clash"
  | "guard"
  | "generic";

export function getImpactKind(
  event: Pick<TurnDamageEvent, "reason" | "chargeMultiplier">,
  phase: Pick<TurnAnimationPhase, "motionType" | "targetMotionType">,
): ImpactKind {
  if (phase.targetMotionType === "barrierBreak") return "guard";
  if (phase.motionType === "barrierBash") return "bash";
  if (phase.motionType === "barrierClash") return "clash";
  if (event.reason === "バリア反射") return "reflect";
  if (event.reason === "強まほう") return "magicStrong";
  if (event.reason === "弱まほう") return "magicWeak";
  if (event.reason === "こうげき") return (event.chargeMultiplier ?? 1) > 1 ? "attackCharged" : "attack";
  return "generic";
}

/** 大きく揺らす・大きくふっとばすヒット */
export function isHeavyImpactKind(kind: ImpactKind): boolean {
  return kind === "attackCharged" || kind === "magicStrong" || kind === "bash";
}

const u = (value: number) => `calc(${value} * var(--u))`;
const at = (x: number | string, y: number): CSSProperties => ({
  left: typeof x === "number" ? u(x) : x,
  top: u(y),
});
/** 反転しないレイヤーで、相手方向に x だけずらす（描き文字用） */
const facing = (x: number, y: number): CSSProperties => ({
  left: `calc(var(--dir) * ${x} * var(--u))`,
  top: u(y),
});
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

function Sfx({ text, className = "", style }: { text: string; className?: string; style: CSSProperties }) {
  return <div className={`fx-sfx ${className}`} style={style}>{text}</div>;
}

function Burst({ className = "" }: { className?: string }) {
  return (
    <div className={`fx-burst ${className}`}>
      <div className="fx-burst-ink" />
      <div className="fx-burst-core" />
    </div>
  );
}

function Sparks({ count, className = "", delayMs = 0 }: { count: number; className?: string; delayMs?: number }) {
  return (
    <div className={`fx-sparks ${className}`}>
      {range(count).map((index) => (
        <i
          key={index}
          style={{
            "--a": `${index * (360 / count) + (index % 2) * 12}deg`,
            "--len": index % 2 ? 0.7 : 1,
            animationDelay: delayMs ? `${delayMs}ms` : undefined,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Slash({ className = "", rotate = 0 }: { className?: string; rotate?: number }) {
  const d = "M18 118 C40 60 80 28 126 22";
  return (
    <svg className={`fx-slash ${className}`} viewBox="0 0 140 140" style={{ "--r": `${rotate}deg` } as CSSProperties}>
      <path className="fx-slash-ink" pathLength={100} d={d} />
      <path className="fx-slash-color" pathLength={100} d={d} />
      <path className="fx-slash-core" pathLength={100} d={d} />
    </svg>
  );
}

function FocusLines({ className, x = 0, y = 0 }: { className: string; x?: number; y?: number }) {
  return <div className="fx-at" style={at(x, y)}><div className={`fx-focus ${className}`} /></div>;
}

/** 当たった瞬間にターゲット側へ出すバースト・火花・擬音 */
export function ImpactEffect({ kind }: { kind: ImpactKind }) {
  switch (kind) {
    case "attack":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(28, -2)}><Slash className="fx-slash-normal" /></div>
            <div className="fx-at" style={at(24, 0)}>
              <Burst className="fx-burst-attack" />
              <Sparks count={8} className="fx-sparks-attack" />
            </div>
          </div>
          <div className="fx-origin"><Sfx text="バシッ!" className="fx-sfx-attack" style={facing(8, -56)} /></div>
        </>
      );
    case "attackCharged":
      return (
        <>
          <div className="fx-mirror">
            <FocusLines className="fx-focus-hit" x={22} />
            <div className="fx-at" style={at(20, 0)}><div className="fx-shockwave" /></div>
            <div className="fx-at" style={at(26, -4)}>
              <Slash className="fx-slash-charged" rotate={-8} />
              <Slash className="fx-slash-charged fx-slash-x" rotate={96} />
            </div>
            <div className="fx-at" style={at(22, 0)}>
              <Burst className="fx-burst-attack fx-burst-charged" />
              <Sparks count={12} className="fx-sparks-attack fx-sparks-charged" />
            </div>
          </div>
          <div className="fx-origin"><Sfx text="ドカンッ!!" className="fx-sfx-attack fx-sfx-charged" style={facing(10, -60)} /></div>
        </>
      );
    case "magicWeak":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(18, -4)}>
              <Burst className="fx-burst-magic-weak" />
              <Sparks count={6} className="fx-sparks-weak" />
            </div>
          </div>
          <div className="fx-origin"><Sfx text="ポンッ!" className="fx-sfx-weak fx-sfx-small" style={facing(2, -54)} /></div>
        </>
      );
    case "magicStrong":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(16, -2)}>
              <div className="fx-shockwave fx-shockwave-magic" />
              <Burst className="fx-burst-magic-strong" />
              <Sparks count={12} className="fx-sparks-strong" />
              {[[-34, -10, 0], [30, -24, 60], [6, 22, 120]].map(([x, y, delay]) => (
                <i key={delay} className="fx-smoke" style={{ ...at(x, y), animationDelay: `${120 + delay}ms` }} />
              ))}
            </div>
          </div>
          <div className="fx-origin"><Sfx text="ドーン!!" className="fx-sfx-strong" style={facing(8, -64)} /></div>
        </>
      );
    case "reflect":
      return (
        <div className="fx-mirror">
          <div className="fx-at" style={at(16, -4)}>
            <Burst className="fx-burst-magic-weak" />
            <Sparks count={6} className="fx-sparks-weak" />
          </div>
        </div>
      );
    case "bash":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(44, -2)}>
              <Burst className="fx-burst-bash" />
              <Sparks count={10} className="fx-sparks-clash" />
            </div>
          </div>
          <div className="fx-origin"><Sfx text="ドゴォッ!" className="fx-sfx-bash" style={facing(24, -60)} /></div>
        </>
      );
    case "generic":
      return (
        <div className="fx-mirror">
          <div className="fx-at" style={at(16, 0)}>
            <Burst className="fx-burst-attack fx-burst-small" />
            <Sparks count={6} className="fx-sparks-attack fx-sparks-small" />
          </div>
        </div>
      );
    default:
      return null;
  }
}

/** こうげき: 突進の後ろに伸びるスピード線（残像は PortraitBlock がキャラ画像で描く） */
export function AttackRushEffect({ charged = false }: { charged?: boolean }) {
  return (
    <div className="fx-mirror">
      {range(5).map((index) => (
        <div key={index} className="fx-at" style={at(index * 9, -32 + index * 15)}>
          <i
            className={`fx-speed${charged ? " fx-speed-charged" : ""}`}
            style={{ width: u(60 + (index % 3) * 22), animationDelay: `${index * 14}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function Rune({ strong }: { strong: boolean }) {
  const ticks = strong ? 8 : 4;
  return (
    <div className={`fx-rune-wrap${strong ? " fx-rune-strong" : ""}`}>
      <svg className="fx-rune" viewBox="0 0 100 100">
        <circle className="fx-rune-ring" pathLength={100} cx="50" cy="50" r="44" />
        {strong ? (
          <>
            <circle className="fx-rune-ring fx-rune-ring2" pathLength={100} cx="50" cy="50" r="34" />
            <polygon className="fx-rune-star" pathLength={100} points="50,16 70,78 18,40 82,40 30,78" />
          </>
        ) : (
          <path className="fx-rune-star" pathLength={100} d="M50 18 L50 82 M18 50 L82 50" />
        )}
        {range(ticks).map((index) => (
          <rect key={index} className="fx-rune-tick" x="48" y="2" width="4" height="9" transform={`rotate(${index * (360 / ticks)} 50 50)`} />
        ))}
      </svg>
    </div>
  );
}

function Orb({ className, tail }: { className: string; tail: number }) {
  return (
    <>
      {range(tail).reverse().map((index) => (
        <div
          key={index}
          className={`fx-orb fx-orb-tail ${className}`}
          style={{ animationDelay: `${(index + 1) * 22}ms`, "--t": 1 - (index + 1) / (tail + 1) } as CSSProperties}
        />
      ))}
      <div className={`fx-orb ${className}`}><span className="fx-orb-ring" /></div>
    </>
  );
}

/** まほう: 足元の魔法陣、（強まほう）集中線と粒子の収束、尾を引く弾。反射時は跳ね返る道すじも描く */
export function MagicCastEffect({ strong = false, reflect = false }: { strong?: boolean; reflect?: boolean }) {
  return (
    <div className="fx-mirror">
      {strong && <FocusLines className="fx-focus-cast" x={56} y={-14} />}
      <div className="fx-at" style={at(0, 56)}><Rune strong={strong} /></div>
      {strong && (
        <div className="fx-at" style={at(70, -20)}>
          {range(10).map((index) => (
            <i key={index} className="fx-converge" style={{ "--a": `${index * 36}deg`, animationDelay: `${(index % 3) * 40}ms` } as CSSProperties} />
          ))}
        </div>
      )}
      {reflect && range(6).map((index) => {
        const t = (index + 1) / 7;
        return (
          <i
            key={index}
            className="fx-trajectory"
            style={{
              left: `calc((var(--gap) - 84 * var(--u)) * ${(1 - t).toFixed(3)} + ${(10 * t).toFixed(1)} * var(--u))`,
              top: u(Math.round(-10 - Math.sin(t * Math.PI) * 62)),
              animationDelay: `${400 + index * 60}ms`,
            }}
          />
        );
      })}
      <div className="fx-at" style={at(0, 0)}>
        <Orb className={`${strong ? "fx-orb-strong" : "fx-orb-weak"}${reflect ? " fx-orb-reflect" : ""}`} tail={strong ? 6 : 4} />
      </div>
    </div>
  );
}

function Wall({ className }: { className: string }) {
  const patternId = `fx-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className={`fx-wall ${className}`} viewBox="0 0 60 170">
      <defs>
        <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#fdba74" strokeWidth="3" />
        </pattern>
      </defs>
      <path className="fx-wall-fill" d="M14 162 Q58 85 14 8 Q34 85 14 162Z" fill={`url(#${patternId})`} />
      <path className="fx-wall-ink" pathLength={100} d="M14 162 Q58 85 14 8" />
      <path className="fx-wall-line" pathLength={100} d="M14 162 Q58 85 14 8" />
      <path className="fx-wall-hi" pathLength={100} d="M18 140 Q44 85 18 30" />
    </svg>
  );
}

const SHARDS: Array<[number, number, number]> = [
  [-60, -70, -200], [-80, -10, 160], [-50, 50, -120], [40, -80, 220], [60, 20, -180], [30, 70, 140], [-20, -95, 260], [-95, 35, -240],
];

function Ripples({ count, delayMs }: { count: number; delayMs: number }) {
  return (
    <>
      {range(count).map((index) => (
        <div key={index} className="fx-ripple" style={{ animationDelay: `${delayMs + index * 45}ms` }} />
      ))}
    </>
  );
}

export type BarrierEffectMode = "deploy" | "hold" | "reflect" | "break" | "clash" | "clashTarget" | "bash";

/**
 * バリアの光の壁（オレンジのマーカーで描いた二重線 + ハッチング）。
 * - deploy: 展開 / hold: こうげきを受け止める / reflect: まほうを跳ね返す / break: 割れる
 * - clash: バリア同士の衝突（アクター側が中央の火花を出す） / clashTarget: 受ける側の壁
 * - bash: 張った壁を相手に叩きつける
 */
export function BarrierEffect({ mode }: { mode: BarrierEffectMode }) {
  switch (mode) {
    case "deploy":
      return (
        <>
          <div className="fx-mirror fx-under">
            <div className="fx-at" style={at(84, 54)}><div className="fx-ground-ring" /></div>
          </div>
          <div className="fx-mirror">
            <div className="fx-at" style={at(80, -10)}>
              <Wall className="fx-wall-deploy" />
              {[[-6, -64, 0], [26, -40, 60], [4, 64, 120]].map(([x, y, delay]) => (
                <span key={delay} className="fx-twinkle" style={{ ...at(x, y), animationDelay: `${200 + delay}ms` }}>✦</span>
              ))}
            </div>
          </div>
          <div className="fx-origin"><Sfx text="キィン!" className="fx-sfx-barrier fx-sfx-small fx-sfx-deploy" style={facing(94, -88)} /></div>
        </>
      );
    case "hold":
      return (
        <div className="fx-mirror">
          <div className="fx-at" style={at(80, -10)}><Wall className="fx-wall-hold" /></div>
          <div className="fx-at" style={at(84, -2)}><Ripples count={3} delayMs={255} /></div>
        </div>
      );
    case "reflect":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(76, -10)}><Wall className="fx-wall-reflect" /></div>
            <div className="fx-at" style={at(80, -2)}><Ripples count={2} delayMs={340} /></div>
          </div>
          <div className="fx-origin"><Sfx text="カキーン!" className="fx-sfx-barrier fx-sfx-reflect" style={facing(70, -60)} /></div>
        </>
      );
    case "break":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(80, -10)}><Wall className="fx-wall-break" /></div>
            <div className="fx-at" style={at(84, -2)}><Ripples count={3} delayMs={0} /></div>
            <div className="fx-at" style={at(82, -10)}>
              <svg className="fx-crack" viewBox="0 0 40 140">
                <polyline pathLength={100} points="20,0 12,26 26,44 10,70 28,92 14,118 22,140" />
              </svg>
              {SHARDS.map(([sx, sy, sr], index) => (
                <svg
                  key={index}
                  className="fx-shard"
                  viewBox="0 0 20 24"
                  style={{ "--sx": u(sx), "--sy": u(sy), "--sr": `${sr}deg`, "--y0": u((index % 4) * 26 - 40) } as CSSProperties}
                >
                  <polygon points={index % 2 ? "2,2 18,6 8,22" : "4,4 19,12 2,20"} />
                </svg>
              ))}
            </div>
            <div className="fx-at" style={at(84, -2)}><Sparks count={6} className="fx-sparks-attack fx-sparks-small" /></div>
          </div>
          <div className="fx-origin"><Sfx text="パリーン!" className="fx-sfx-barrier fx-sfx-break" style={facing(76, -72)} /></div>
        </>
      );
    case "clash":
    case "clashTarget":
      return (
        <>
          <div className="fx-mirror">
            <div className="fx-at" style={at(70, -10)}><Wall className="fx-wall-clash" /></div>
            {mode === "clash" && (
              <div className="fx-at fx-clash-point" style={at("calc(var(--gap) / 2)", -10)}>
                <div className="fx-clash-flash" />
                <Sparks count={10} className="fx-sparks-clash" delayMs={230} />
              </div>
            )}
          </div>
          {mode === "clash" && (
            <div className="fx-origin">
              <Sfx text="ガキィン!" className="fx-sfx-clash" style={{ left: "calc(var(--dir) * var(--gap) / 2)", top: u(-82) }} />
            </div>
          )}
        </>
      );
    case "bash":
      return (
        <div className="fx-mirror">
          {range(3).map((index) => (
            <div key={index} className="fx-at" style={at(60 - index * 4, -48 + index * 38)}>
              <i className="fx-speed fx-speed-bash" style={{ width: u(56 + (index % 2) * 20), animationDelay: `${200 + index * 16}ms` }} />
            </div>
          ))}
          <div className="fx-at" style={at(76, -10)}>
            <div className="fx-bash-wall"><Wall className="fx-wall-bash" /></div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

/** チャージ: 足元の光・炎・地面の輪（キャラの後ろに描く） */
export function ChargeUnderEffect({ overcharged = false }: { overcharged?: boolean }) {
  const flames = overcharged ? 11 : 7;
  return (
    <>
      <div className={`fx-charge-glow${overcharged ? " fx-charge-glow-over" : ""}`} />
      {range(flames).map((index) => (
        <i
          key={index}
          className={`fx-flame${overcharged ? " fx-flame-over" : ""}`}
          style={{
            left: `calc(50% + ${((index - (flames - 1) / 2) * (96 / flames)).toFixed(1)} * var(--u))`,
            animationDelay: `${(index * 97) % 300}ms`,
            "--h": 0.75 + ((index * 37) % 5) / 10,
          } as CSSProperties}
        />
      ))}
      <div className="fx-origin fx-under">
        <div className="fx-at" style={at(0, 54)}>
          <div className={`fx-ground-ring ${overcharged ? "fx-ground-ring-over" : "fx-ground-ring-charge"}`} />
          <div className={`fx-ground-ring ${overcharged ? "fx-ground-ring-over" : "fx-ground-ring-charge"}`} style={{ animationDelay: `${overcharged ? 220 : 260}ms` }} />
        </div>
      </div>
    </>
  );
}

/** チャージ: 集中線・粒子の収束・（オーバーチャージ）稲妻・擬音（キャラの前に描く） */
export function ChargeOverEffect({ overcharged = false }: { overcharged?: boolean }) {
  const particles = overcharged ? 14 : 10;
  return (
    <>
      <div className="fx-mirror">
        <FocusLines className={`fx-focus-charge${overcharged ? " fx-focus-over" : ""}`} />
        <div className="fx-at" style={at(0, 0)}>
          {range(particles).map((index) => (
            <i
              key={index}
              className={`fx-converge fx-converge-charge${overcharged ? " fx-converge-over" : ""}`}
              style={{ "--a": `${index * (360 / particles)}deg`, animationDelay: `${(index % 3) * 40}ms` } as CSSProperties}
            />
          ))}
        </div>
        {overcharged && (
          <div className="fx-at" style={at(0, -2)}>
            <svg className="fx-bolts" viewBox="0 0 160 160">
              <polyline className="fx-bolt" points="22,40 38,58 28,66 46,88" />
              <polyline className="fx-bolt fx-bolt2" points="138,36 120,56 132,64 112,90" />
              <polyline className="fx-bolt fx-bolt3" points="74,4 86,20 76,26 90,42" />
            </svg>
          </div>
        )}
      </div>
      <div className="fx-origin">
        {overcharged
          ? <Sfx text="ゴゴゴ…!!" className="fx-sfx-over" style={at(0, -90)} />
          : <Sfx text="ハァァッ!" className="fx-sfx-charge fx-sfx-small" style={at(0, -90)} />}
      </div>
    </>
  );
}

/** チャージ後も足元に残る、軽量な待機オーラ */
export function ChargeIdleAura({ overcharged = false, delayed = false }: { overcharged?: boolean; delayed?: boolean }) {
  return <div className={`fx-aura-idle${overcharged ? " fx-aura-idle-over" : ""}${delayed ? " fx-aura-idle-delayed" : ""}`} aria-hidden="true" />;
}

/** まひ: 体の上を走る稲妻（位置をずらした 2 組を交互に点滅）と火花。画像と同じ箱に重ねる */
export function ParalysisBolts() {
  return (
    <>
      <svg className="fx-stun-bolts" viewBox="0 0 120 120" aria-hidden="true">
        <g className="fx-stun-set">
          <polyline points="18,30 34,44 26,52 46,66" />
          <polyline points="98,24 84,42 94,50 76,70" />
          <polyline points="40,92 54,82 58,96 74,86" />
        </g>
        <g className="fx-stun-set fx-stun-set2">
          <polyline points="56,10 46,28 58,32 48,50" />
          <polyline points="12,70 30,74 24,86 42,94" />
          <polyline points="104,62 90,74 102,82 86,98" />
        </g>
      </svg>
      {[[8, 20, 0], [108, 34, 70], [16, 96, 140], [100, 100, 210], [60, -4, 105]].map(([x, y, delay]) => (
        <i key={delay} className="fx-stun-spark" aria-hidden="true" style={{ left: `${(x / 120) * 100}%`, top: `${(y / 120) * 100}%`, animationDelay: `${delay}ms` }} />
      ))}
    </>
  );
}

/** まひ: 「ビリビリッ」の描き文字（まひのフェーズで表示） */
export function ParalysisText() {
  return <div className="fx-origin"><Sfx text="ビリビリッ" className="fx-sfx-stun" style={at(0, -74)} /></div>;
}
