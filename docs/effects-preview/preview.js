// バトルエフェクト強化案のスタンドアロンプレビュー。
// - BEFORE: 本番の frontend/src/app/globals.css をそのまま読み込み、
//   MoveMotionOverlay.tsx / BattlePanel.tsx のインラインスタイルを同じ値で再現している。
// - AFTER : after.css の提案 keyframes（fx- 接頭辞）で組み立てた強化案。
// 本番コードには一切依存しない（ビルド不要、ブラウザで index.html を開くだけ）。

const IMG = { left: "assets/doodle-left.svg", right: "assets/doodle-right.svg" };
const POS = { left: 60, right: 260 }; // ファイターの左上 x（top は 100、120x120）

// BattlePanel.tsx の白ふちどり + 接地影 filter（現行と同じ値）
const PORTRAIT_FILTER = [
  "drop-shadow(2px 0 0 rgba(248,250,252,0.95)) drop-shadow(-2px 0 0 rgba(248,250,252,0.95)) drop-shadow(0 2px 0 rgba(248,250,252,0.95)) drop-shadow(0 -2px 0 rgba(248,250,252,0.95))",
  "drop-shadow(0 8px 10px rgba(0,0,0,0.55))",
].join(" ");
const CHARGED_FILTER = "drop-shadow(0 0 6px #facc15cc) drop-shadow(0 0 12px #facc1577)";
const OVERCHARGED_FILTER = "drop-shadow(0 0 8px #e0f2fe) drop-shadow(0 0 18px #60a5fa) drop-shadow(0 0 26px #38bdf8aa)";

const dirOf = (side) => (side === "left" ? 1 : -1);
const other = (side) => (side === "left" ? "right" : "left");
const range = (n) => Array.from({ length: n }, (_, i) => i);

/* =====================================================================
 * BEFORE: 現行の実装をそのまま再現
 * ===================================================================== */

function beforeFighter(side, o = {}) {
  const dir = dirOf(side);
  const hitDir = side === "left" ? -1 : 1; // getHitPortraitStyle
  const imgFilter = [PORTRAIT_FILTER, o.charged === "overcharged" ? OVERCHARGED_FILTER : o.charged ? CHARGED_FILTER : ""]
    .filter(Boolean)
    .join(" ");
  const chargeGlow = o.charged === "overcharged"
    ? "cooperativeChargeGlowPortrait 1.2s ease-in-out infinite"
    : o.charged ? "chargeGlowPortrait 1.2s ease-in-out infinite" : "none";
  const floater = o.floater
    ? `<div class="sticker-text" style="position:absolute;bottom:calc(100% + 38px);left:50%;z-index:12;color:${o.floater.charged ? "#fbbf24" : o.floater.big ? "#dc2626" : "#f87171"};font-weight:900;font-size:${o.floater.charged ? "clamp(22px, 2.4vw, 36px)" : o.floater.big ? "clamp(20px, 2vw, 32px)" : "clamp(18px, 1.8vw, 28px)"};-webkit-text-stroke:${o.floater.charged || o.floater.big ? 5 : 4}px #14161f;text-shadow:0 3px 0 #14161f, 0 0 14px #facc15;animation:damageStickerPop 1.25s cubic-bezier(0.18, 1.4, 0.4, 1) forwards;pointer-events:none;white-space:nowrap;">${o.floater.text}</div>`
    : "";
  const impact = o.impact
    ? `<div class="comic-burst${o.impact.charged ? " comic-burst-charged" : ""}"><span>${o.impact.charged ? "ドカンッ!" : "バシッ!"}</span></div>
       <div class="impactParticles${o.impact.charged ? " impactParticlesCharged" : ""}">${range(o.impact.charged ? 8 : 6)
         .map((i) => `<i style="--particle-angle:${i * (360 / (o.impact.charged ? 8 : 6))}deg"></i>`)
         .join("")}</div>`
    : "";
  const badge = o.badge
    ? `<div class="doodle-frame" style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) rotate(-2deg);z-index:13;background:${o.badge.color};border:3px solid #f8fafc;color:#fff;font-weight:900;font-size:13px;padding:4px 14px;white-space:nowrap;box-shadow:0 4px 0 rgba(0,0,0,0.55)">${o.badge.text}</div>`
    : "";
  return `
  <div class="fx-fighter" style="left:${POS[side]}px">
    ${badge}${floater}${impact}
    <div class="fx-shadow"></div>
    <div style="animation:${side === "left" ? "doodleIdleFloat 3.4s" : "doodleIdleFloatRight 3.8s"} ease-in-out infinite">
      <div class="portrait-motion-frame" style="animation:${o.motion ?? ""};--dir:${dir};--motion-power:${o.power ?? 1}">
        <div class="portrait-hit-frame" style="animation:${o.hit ? "hitRecoil 0.72s ease-out forwards" : ""};--dir:${hitDir};--hit-distance:${o.hit?.heavy ? "44px" : "24px"};--hit-angle:${o.hit?.heavy ? "18deg" : "10deg"}">
          <div style="animation:${o.hit ? "hitFlash 720ms ease-out forwards" : "none"}">
            <div style="animation:${chargeGlow}">
              <div style="animation:${o.magicGlow ? "magicPortraitGlow 0.82s ease-out forwards" : ""}">
                <img src="${IMG[side]}" alt="" class="fx-img" style="filter:${imgFilter};transform:${o.acting ? "scale(1.08)" : "scale(1)"}">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    ${o.effects ?? ""}
  </div>`;
}

// AttackTrailEffect
const beforeTrail = (side, charged) =>
  `<div class="attack-trail-effect${charged ? " attack-trail-charged" : ""}" style="left:${side === "left" ? "58%" : "4%"};--dir:${dirOf(side)}"></div>`;
// ChargeAuraEffect
const beforeChargeAura = () => `<div class="charge-aura-effect"></div>`;
// MagicBullet（finalBoss=false）
function beforeBullet(side, motionType, strong) {
  const isReflect = motionType === "magicReflect";
  const size = strong ? 36 : 24;
  const animation = isReflect
    ? "barrierReflect 0.52s ease-out 0.3s forwards"
    : `magicBlast 0.52s ease-out 0.3s forwards${strong ? ", chargeGlow 0.9s ease-in-out infinite" : ""}`;
  return `<div class="magic-bullet-effect" style="position:absolute;top:40%;left:${side === "left" ? "80%" : "20%"};z-index:15;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle, #c4b5fd, #7c3aed 60%, #4c1d95);box-shadow:${strong ? "0 0 18px 6px rgba(167,139,250,0.55), 0 0 28px 10px rgba(124,58,237,0.35)" : "0 0 12px 4px #a78bfa88"};animation:${animation};--blast-dx:${side === "left" ? 140 : -140}px;pointer-events:none"></div>`;
}
// MagicRuneEffect
function beforeRune(side, strong) {
  const size = strong ? 76 : 54;
  const n = strong ? 8 : 6;
  return `<div class="magic-rune-effect" style="position:absolute;z-index:11;left:50%;bottom:4%;width:${size}px;height:${size}px;border:${strong ? 3 : 2}px solid #c4b5fd;border-radius:50%;box-shadow:${strong ? "0 0 24px 8px #8b5cf688" : "0 0 14px 4px #8b5cf666"};--dir:${dirOf(side)}"><span class="magic-rune-inner"></span>${range(n)
    .map((i) => `<i style="--particle-angle:${i * (360 / n)}deg"></i>`)
    .join("")}</div>`;
}
// BarrierWallEffect
function beforeWall(side, motionType) {
  const wallSide = side === "left" ? "right" : "left";
  const name = motionType;
  const duration = motionType === "barrierBreak" ? "0.5s" : motionType === "barrierClash" ? "0.7s" : "0.75s";
  return `<div class="barrier-wall-effect" style="position:absolute;top:5%;${wallSide}:-10px;width:12px;height:90%;border-radius:6px;background:linear-gradient(to bottom, #fbbf2400, #fbbf24cc 30%, #fbbf24cc 70%, #fbbf2400);box-shadow:0 0 14px 4px #fbbf2488, inset 0 0 8px #fde68a66;transform-origin:bottom center;animation:${name} ${duration} ease-out forwards;--clash-dx:${side === "left" ? 50 : -50}px;z-index:12;pointer-events:none"></div>`;
}

// ACTION_COLORS.paralysis / ACTION_LABELS.paralysis（BattlePanel.tsx）
const PARALYSIS_BADGE = { text: "まひ", color: "#6b7280" };

const BEFORE = {
  attack: () => ({
    html: beforeFighter("left", { acting: true, motion: "attackLunge 0.72s ease-out forwards", effects: beforeTrail("left", false) }) +
      beforeFighter("right", { hit: {}, impact: {}, floater: { text: "24" } }),
  }),
  attackCharged: () => ({
    shake: "screenShakeCharged 0.36s ease-in-out",
    html: beforeFighter("left", { acting: true, charged: true, power: 1.4, motion: "attackLunge 0.72s ease-out forwards", effects: beforeTrail("left", true) }) +
      beforeFighter("right", { hit: { heavy: true }, impact: { charged: true }, floater: { text: "48", charged: true } }),
  }),
  barrierWall: () => ({
    html: beforeFighter("left", { acting: true, motion: "barrierBrace 0.75s ease-out forwards", effects: beforeWall("left", "barrierWall") }) +
      beforeFighter("right", {}),
  }),
  barrierBreak: () => ({
    html: beforeFighter("left", { acting: true, motion: "attackLunge 0.72s ease-out forwards", effects: beforeTrail("left", false) }) +
      beforeFighter("right", { effects: beforeWall("right", "barrierBreak") }),
  }),
  barrierClash: () => ({
    html: beforeFighter("left", { acting: true, motion: "barrierBrace 0.75s ease-out forwards", effects: beforeWall("left", "barrierClash") }) +
      beforeFighter("right", { acting: true, motion: "barrierBrace 0.75s ease-out forwards", effects: beforeWall("right", "barrierClash") }),
  }),
  magicReflect: () => ({
    html: beforeFighter("left", { acting: true, magicGlow: true, motion: "magicCast 0.82s ease-out forwards", hit: {}, impact: {}, floater: { text: "18" }, effects: beforeBullet("left", "magicReflect", false) + beforeRune("left", false) }) +
      beforeFighter("right", { effects: beforeWall("right", "barrierWall") }),
  }),
  magicWeak: () => ({
    html: beforeFighter("left", { acting: true, magicGlow: true, motion: "magicCast 0.82s ease-out forwards", effects: beforeBullet("left", "magicBlast", false) + beforeRune("left", false) }) +
      beforeFighter("right", { hit: {}, impact: {}, floater: { text: "18" } }),
  }),
  magicStrong: () => ({
    shake: "screenShake 0.22s ease-in-out",
    html: beforeFighter("left", { acting: true, magicGlow: true, motion: "magicCast 0.82s ease-out forwards", effects: beforeBullet("left", "magicBlast", true) + beforeRune("left", true) }) +
      beforeFighter("right", { hit: { heavy: true }, impact: {}, floater: { text: "42", big: true } }),
  }),
  charge: () => ({
    html: beforeFighter("left", { acting: true, charged: true, motion: "chargeConcentration 0.8s ease-out forwards", effects: beforeChargeAura() }) +
      beforeFighter("right", {}),
  }),
  barrierBashCharge: () => ({
    html: beforeFighter("left", { acting: true, motion: "barrierBrace 0.75s ease-out forwards", effects: beforeWall("left", "barrierWall") }) +
      beforeFighter("right", { charged: true, hit: {}, impact: {}, floater: { text: "16" } }),
  }),
  barrierBashParalysis: () => ({
    html: beforeFighter("left", { acting: true, motion: "barrierBrace 0.75s ease-out forwards", effects: beforeWall("left", "barrierWall") }) +
      beforeFighter("right", { badge: PARALYSIS_BADGE, hit: {}, impact: {}, floater: { text: "16" } }),
  }),
  paralysis: () => ({
    html: beforeFighter("left", {}) + beforeFighter("right", { badge: PARALYSIS_BADGE }),
  }),
  overcharge: () => ({
    html: beforeFighter("left", { acting: true, charged: "overcharged", motion: "chargeConcentration 0.8s ease-out forwards", effects: beforeChargeAura() }) +
      beforeFighter("right", {}),
  }),
};

/* =====================================================================
 * AFTER: 強化案
 * ===================================================================== */

// 共通の入れ子構造: motion（行動ポーズ）→ hit（被弾リアクション）→ 画像 + 白シルエット（ヒットフラッシュ）
function afterFighter(side, o = {}) {
  const imgFilter = [PORTRAIT_FILTER, o.charged === "overcharged" ? OVERCHARGED_FILTER.replace(/#60a5fa|#38bdf8aa|#e0f2fe/g, (c) => ({ "#60a5fa": "#facc15", "#38bdf8aa": "#16a34aaa", "#e0f2fe": "#fef9c3" })[c]) : o.charged ? "drop-shadow(0 0 6px #4ade80cc) drop-shadow(0 0 12px #16a34a77)" : ""]
    .filter(Boolean)
    .join(" ");
  const ghosts = (o.ghosts ?? 0) > 0
    ? range(o.ghosts).map((i) => `<div class="fx-ghost-wrap" style="--dir:${dirOf(side)};--reach:${o.reach ?? 90}px;animation-delay:${(i + 1) * 28}ms"><img src="${IMG[side]}" class="fx-img fx-ghost-img" alt="" style="opacity:${0.75 - i * 0.2}"></div>`).join("")
    : "";
  return `
  <div class="fx-fighter" style="left:${POS[side]}px">
    ${o.badge ? `<div class="fx-badge doodle-frame" style="background:${o.badge.color}">${o.badge.text}</div>` : ""}
    <div class="fx-shadow"></div>
    ${o.under ?? ""}
    ${ghosts}
    <div style="animation:${side === "left" ? "doodleIdleFloat 3.4s" : "doodleIdleFloatRight 3.8s"} ease-in-out infinite">
      <div class="fx-motion ${o.motion ?? ""}" style="--dir:${dirOf(side)};--reach:${o.reach ?? 90}px">
        <div class="fx-hit ${o.hit ?? ""}" style="--dir:${side === "left" ? -1 : 1};--kb:${o.kb ?? 22}px">
          <img src="${IMG[side]}" alt="" class="fx-img" style="filter:${imgFilter}">
          ${o.hit ? `<img src="${IMG[side]}" alt="" class="fx-img fx-silhouette fx-hit-sil">` : ""}
          ${o.pulse ? `<img src="${IMG[side]}" alt="" class="fx-img fx-silhouette ${o.pulse}">` : ""}
          ${o.onBody ?? ""}
        </div>
      </div>
    </div>
    ${o.over ?? ""}
  </div>`;
}

const at = (x, y, inner, extra = "") => `<div class="fx-at" style="left:${x}px;top:${y}px;${extra}">${inner}</div>`;

// 描き文字（擬音）
const sfx = (text, cls = "") => `<div class="fx-sfx ${cls}">${text}</div>`;

// ギザギザのヒットバースト（インクの縁取り付き）
const burst = (cls = "") => `<div class="fx-burst ${cls}"><div class="fx-burst-ink"></div><div class="fx-burst-core"></div></div>`;

// 放射状の火花（マーカーの線）
const sparks = (n, cls = "") => `<div class="fx-sparks ${cls}">${range(n).map((i) => `<i style="--a:${i * (360 / n) + (i % 2) * 12}deg;--len:${i % 2 ? 0.7 : 1}"></i>`).join("")}</div>`;

// 斬撃の軌跡（クレヨンの太い弧）
const slash = (cls = "", rot = 0) => `
  <svg class="fx-slash ${cls}" viewBox="0 0 140 140" style="--r:${rot}deg">
    <path class="fx-slash-ink" pathLength="100" d="M18 118 C40 60 80 28 126 22"/>
    <path class="fx-slash-color" pathLength="100" d="M18 118 C40 60 80 28 126 22"/>
    <path class="fx-slash-core" pathLength="100" d="M18 118 C40 60 80 28 126 22"/>
  </svg>`;

// 集中線（マンガの効果線）
const focusLines = (cls = "", cx = "73%", cy = "60%") => `<div class="fx-focus ${cls}" style="--cx:${cx};--cy:${cy}"></div>`;

// ダメージ数字
const damage = (x, text, cls = "") => at(x, 52, `<div class="fx-dmg ${cls}">${text}</div>`);

// スピード線
const speedLines = (side, cls = "") => range(5).map((i) =>
  at(side === "left" ? 120 + i * 9 : 320 - i * 9, 128 + i * 15, `<i class="fx-speed ${cls}" style="--dir:${dirOf(side)};animation-delay:${i * 14}ms;width:${60 + (i % 3) * 22}px"></i>`)
).join("");

// バリアの光の壁（オレンジのマーカーで描いた二重線 + ハッチング）
function wall(side, cls = "") {
  const flip = side === "left" ? 1 : -1;
  return `<svg class="fx-wall ${cls}" viewBox="0 0 60 170" style="--flip:${flip}">
    <defs><pattern id="hatch-${side}-${cls.replace(/\s+/g, "-")}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="8" stroke="#fdba74" stroke-width="3"/></pattern></defs>
    <path class="fx-wall-fill" d="M14 162 Q58 85 14 8 Q34 85 14 162Z" fill="url(#hatch-${side}-${cls.replace(/\s+/g, "-")})"/>
    <path class="fx-wall-ink" pathLength="100" d="M14 162 Q58 85 14 8"/>
    <path class="fx-wall-line" pathLength="100" d="M14 162 Q58 85 14 8"/>
    <path class="fx-wall-hi" pathLength="100" d="M18 140 Q44 85 18 30"/>
  </svg>`;
}

const twinkles = (cls = "") => [[-6, -64, 0], [26, -40, 60], [4, 64, 120]].map(([x, y, d]) =>
  `<span class="fx-twinkle ${cls}" style="left:${x}px;top:${y}px;animation-delay:${200 + d}ms">✦</span>`).join("");

// 割れたバリアの破片
const shards = () => [
  [-60, -70, -200], [-80, -10, 160], [-50, 50, -120], [40, -80, 220], [60, 20, -180], [30, 70, 140], [-20, -95, 260], [-95, 35, -240],
].map(([sx, sy, sr], i) =>
  `<svg class="fx-shard" viewBox="0 0 20 24" style="--sx:${sx}px;--sy:${sy}px;--sr:${sr}deg;--y0:${(i % 4) * 26 - 40}px"><polygon points="${i % 2 ? "2,2 18,6 8,22" : "4,4 19,12 2,20"}"/></svg>`).join("");

// 魔法陣（手描きの二重丸 + 星）
function rune(cls = "", strong = false) {
  return `<div class="fx-rune-wrap ${cls}"><svg class="fx-rune" viewBox="0 0 100 100">
    <circle class="fx-rune-ring" pathLength="100" cx="50" cy="50" r="44"/>
    ${strong ? `<circle class="fx-rune-ring fx-rune-ring2" pathLength="100" cx="50" cy="50" r="34"/>
      <polygon class="fx-rune-star" pathLength="100" points="50,16 70,78 18,40 82,40 30,78"/>` : `<path class="fx-rune-star" pathLength="100" d="M50 18 L50 82 M18 50 L82 50"/>`}
    ${range(strong ? 8 : 4).map((i) => `<rect class="fx-rune-tick" x="48" y="2" width="4" height="9" transform="rotate(${i * (360 / (strong ? 8 : 4))} 50 50)"/>`).join("")}
  </svg></div>`;
}

// まほう弾 + クレヨンの尾
function orb(cls, tail) {
  return range(tail).reverse().map((i) => `<div class="fx-orb fx-orb-tail ${cls}" style="animation-delay:${(i + 1) * 22}ms;--t:${1 - (i + 1) / (tail + 1)}"></div>`).join("") +
    `<div class="fx-orb ${cls}"><span class="fx-orb-ring"></span></div>`;
}

const converge = (n, cls = "") => range(n).map((i) =>
  `<i class="fx-converge ${cls}" style="--a:${i * (360 / n)}deg;animation-delay:${(i % 3) * 40}ms"></i>`).join("");

const flames = (n, cls = "") => range(n).map((i) => {
  const x = (i - (n - 1) / 2) * (96 / n);
  return `<i class="fx-flame ${cls}" style="left:calc(50% + ${x}px);animation-delay:${(i * 97) % 300}ms;--h:${0.75 + ((i * 37) % 5) / 10}"></i>`;
}).join("");

const smoke = () => [[-34, -10, 0], [30, -24, 60], [6, 22, 120]].map(([x, y, d]) =>
  `<i class="fx-smoke" style="left:${x}px;top:${y}px;animation-delay:calc(var(--hit) + ${120 + d}ms)"></i>`).join("");

const bolts = () => `<svg class="fx-bolts" viewBox="0 0 160 160">
  <polyline class="fx-bolt" points="22,40 38,58 28,66 46,88"/>
  <polyline class="fx-bolt fx-bolt2" points="138,36 120,56 132,64 112,90"/>
  <polyline class="fx-bolt fx-bolt3" points="74,4 86,20 76,26 90,42"/></svg>`;

// まひ: 体の上を走る稲妻（黄色のマーカー + インクの縁取り）。位置をずらした 2 組を交互に点滅させる
const stunBolts = () => `<svg class="fx-stun-bolts" viewBox="0 0 120 120">
  <g class="fx-stun-set">
    <polyline points="18,30 34,44 26,52 46,66"/>
    <polyline points="98,24 84,42 94,50 76,70"/>
    <polyline points="40,92 54,82 58,96 74,86"/>
  </g>
  <g class="fx-stun-set fx-stun-set2">
    <polyline points="56,10 46,28 58,32 48,50"/>
    <polyline points="12,70 30,74 24,86 42,94"/>
    <polyline points="104,62 90,74 102,82 86,98"/>
  </g>
</svg>`;

const stunSparks = () => [[8, 20, 0], [108, 34, 70], [16, 96, 140], [100, 100, 210], [60, -4, 105]].map(([x, y, d]) =>
  `<i class="fx-stun-spark" style="left:${x}px;top:${y}px;animation-delay:${d}ms"></i>`).join("");

const stunned = (extra = {}) => ({
  motion: "fx-stun",
  pulse: "fx-stun-flash",
  onBody: stunBolts(),
  badge: { text: "まひ", color: "#6b7280" },
  over: stunSparks() + at(60, -14, sfx("ビリビリッ", "fx-sfx-stun")),
  ...extra,
});

// バリアをぶつける: 自分の前に張った壁を、押し出して相手に叩きつける
const bashWall = () => at(196, 150, `<div class="fx-bash-wall">${wall("left", "fx-wall-bash-shape")}</div>`);
const bashTrail = () => range(3).map((i) =>
  at(180 - i * 4, 112 + i * 38, `<i class="fx-speed fx-bash-speed" style="--dir:1;width:${56 + (i % 2) * 20}px;animation-delay:${i * 16}ms"></i>`)).join("");

const AFTER = {
  attack: () => ({
    hit: 255,
    world: "fx-shake-hit",
    html:
      speedLines("left") +
      afterFighter("left", { motion: "fx-attack-actor", reach: 92, ghosts: 2 }) +
      afterFighter("right", { hit: "fx-hit-target", kb: 26 }) +
      at(292, 158, slash("fx-slash-normal", 0)) +
      at(296, 160, burst("fx-burst-attack") + sparks(8, "fx-sparks-attack")) +
      at(312, 104, sfx("バシッ!", "fx-sfx-attack")) +
      damage(330, "24", "fx-dmg-attack"),
  }),
  attackCharged: () => ({
    hit: 255,
    world: "fx-shake-hit fx-shake-big",
    html:
      focusLines("fx-focus-hit", "68%", "60%") +
      speedLines("left", "fx-speed-charged") +
      afterFighter("left", { motion: "fx-attack-actor fx-attack-actor-charged", reach: 104, ghosts: 3, charged: true }) +
      afterFighter("right", { hit: "fx-hit-target fx-hit-target-heavy", kb: 46 }) +
      at(300, 160, `<div class="fx-shockwave"></div>`) +
      at(294, 156, slash("fx-slash-charged", -8) + slash("fx-slash-charged fx-slash-x", 96)) +
      at(298, 160, burst("fx-burst-attack fx-burst-charged") + sparks(12, "fx-sparks-attack fx-sparks-charged")) +
      at(310, 100, sfx("ドカンッ!!", "fx-sfx-attack fx-sfx-charged")) +
      damage(330, "48", "fx-dmg-attack fx-dmg-charged"),
  }),
  barrierWall: () => ({
    hit: 0,
    html:
      afterFighter("left", { motion: "fx-brace" }) +
      afterFighter("right", {}) +
      at(204, 160, `<div class="fx-ground-ring fx-ground-ring-barrier"></div>`, "top:214px") +
      at(200, 150, wall("left", "fx-wall-deploy") + twinkles()) +
      at(214, 72, sfx("キィン!", "fx-sfx-barrier fx-sfx-small")),
  }),
  barrierBreak: () => ({
    hit: 255,
    world: "fx-shake-hit",
    html:
      afterFighter("left", { motion: "fx-attack-actor", reach: 66, ghosts: 1 }) +
      afterFighter("right", { hit: "fx-guard-flinch", kb: 10 }) +
      at(240, 150, wall("right", "fx-wall-break")) +
      at(236, 158, range(3).map((i) => `<div class="fx-ripple" style="animation-delay:calc(var(--at) + ${i * 45}ms)"></div>`).join("")) +
      at(238, 150, `<svg class="fx-crack" viewBox="0 0 40 140"><polyline pathLength="100" points="20,0 12,26 26,44 10,70 28,92 14,118 22,140"/></svg>`) +
      at(238, 150, shards()) +
      at(236, 158, sparks(6, "fx-sparks-attack fx-sparks-small")) +
      at(244, 88, sfx("パリーン!", "fx-sfx-barrier fx-sfx-break")),
  }),
  barrierClash: () => ({
    hit: 230,
    world: "fx-shake-clash",
    html:
      afterFighter("left", { motion: "fx-brace" }) +
      afterFighter("right", { motion: "fx-brace" }) +
      at(190, 150, wall("left", "fx-wall-clash"), "--dir:1") +
      at(250, 150, wall("right", "fx-wall-clash"), "--dir:-1") +
      at(220, 150, `<div class="fx-clash-flash"></div>` + sparks(10, "fx-sparks-clash")) +
      at(220, 78, sfx("ガキィン!", "fx-sfx-clash")),
  }),
  magicReflect: () => ({
    hit: 612,
    html:
      afterFighter("left", { motion: "fx-cast", hit: "fx-hit-target fx-hit-late", kb: 22 }) +
      afterFighter("right", { motion: "fx-brace" }) +
      at(120, 216, rune("fx-rune-weak")) +
      at(244, 150, wall("right", "fx-wall-reflect")) +
      at(244, 150, range(2).map((i) => `<div class="fx-ripple fx-ripple-reflect" style="animation-delay:calc(var(--at) + ${i * 45}ms)"></div>`).join("")) +
      range(6).map((i) => {
        const t = (i + 1) / 7;
        const x = 236 - t * 106;
        const y = 150 - Math.sin(t * Math.PI) * 62;
        return at(x, y, `<i class="fx-trajectory" style="animation-delay:${370 + i * 30}ms"></i>`);
      }).join("") +
      at(0, 0, orb("fx-orb-weak fx-orb-reflect", 4)) +
      at(250, 90, sfx("カキーン!", "fx-sfx-barrier fx-sfx-reflect")) +
      at(136, 156, burst("fx-burst-magic-weak fx-burst-late") + sparks(6, "fx-sparks-weak fx-sparks-late")) +
      damage(120, "18", "fx-dmg-weak"),
  }),
  magicWeak: () => ({
    hit: 442,
    html:
      afterFighter("left", { motion: "fx-cast" }) +
      afterFighter("right", { hit: "fx-hit-target fx-hit-magic", kb: 18 }) +
      at(120, 216, rune("fx-rune-weak")) +
      at(0, 0, orb("fx-orb-weak", 4)) +
      at(302, 156, burst("fx-burst-magic-weak") + sparks(6, "fx-sparks-weak")) +
      at(318, 106, sfx("ポンッ!", "fx-sfx-weak fx-sfx-small")) +
      damage(330, "18", "fx-dmg-weak"),
  }),
  magicStrong: () => ({
    hit: 510,
    world: "fx-shake-strong",
    html:
      focusLines("fx-focus-cast", "40%", "56%") +
      afterFighter("left", { motion: "fx-cast fx-cast-strong", pulse: "fx-cast-glow" }) +
      afterFighter("right", { hit: "fx-hit-target fx-hit-target-heavy fx-hit-strong", kb: 40 }) +
      at(120, 216, rune("fx-rune-strong", true)) +
      at(190, 140, converge(10, "fx-converge-magic")) +
      at(0, 0, orb("fx-orb-strong", 6)) +
      at(304, 158, `<div class="fx-shockwave fx-shockwave-magic"></div>` + burst("fx-burst-magic-strong") + sparks(12, "fx-sparks-strong") + smoke()) +
      at(312, 96, sfx("ドーン!!", "fx-sfx-strong")) +
      damage(330, "42", "fx-dmg-strong"),
  }),
  charge: () => ({
    hit: 0,
    html:
      focusLines("fx-focus-charge", "27%", "60%") +
      afterFighter("left", {
        motion: "fx-charge-actor",
        pulse: "fx-charge-pulse",
        charged: true,
        under: `<div class="fx-charge-glow"></div>` + flames(7) + `<div class="fx-aura-idle"></div>`,
        over: `<div class="fx-at" style="left:60px;top:60px">${converge(10, "fx-converge-charge")}</div>`,
      }) +
      afterFighter("right", {}) +
      at(120, 214, `<div class="fx-ground-ring fx-ground-ring-charge"></div><div class="fx-ground-ring fx-ground-ring-charge" style="animation-delay:260ms"></div>`) +
      at(120, 70, sfx("ハァァッ!", "fx-sfx-charge fx-sfx-small")),
  }),
  barrierBashCharge: () => ({
    hit: 300,
    world: "fx-shake-hit",
    html:
      bashTrail() +
      afterFighter("left", { motion: "fx-bash-actor" }) +
      afterFighter("right", {
        motion: "fx-charge-actor",
        hit: "fx-hit-target fx-hit-target-heavy",
        kb: 36,
        under: `<div class="fx-interrupt">${flames(5)}<div class="fx-charge-glow"></div></div>`,
      }) +
      bashWall() +
      at(276, 158, burst("fx-burst-bash") + sparks(10, "fx-sparks-clash")) +
      at(296, 100, sfx("ドゴォッ!", "fx-sfx-bash")) +
      damage(330, "16", "fx-dmg-bash"),
  }),
  barrierBashParalysis: () => ({
    hit: 300,
    world: "fx-shake-hit",
    html:
      bashTrail() +
      afterFighter("left", { motion: "fx-bash-actor" }) +
      afterFighter("right", stunned({ hit: "fx-hit-target fx-hit-target-heavy", kb: 36, over: stunSparks() })) +
      bashWall() +
      at(276, 158, burst("fx-burst-bash") + sparks(10, "fx-sparks-clash")) +
      at(296, 100, sfx("ドゴォッ!", "fx-sfx-bash")) +
      damage(396, "16", "fx-dmg-bash"),
  }),
  paralysis: () => ({
    hit: 0,
    html: afterFighter("left", {}) + afterFighter("right", stunned()),
  }),
  overcharge: () => ({
    world: "fx-shake-rumble",
    html:
      focusLines("fx-focus-charge fx-focus-over", "27%", "60%") +
      afterFighter("left", {
        motion: "fx-charge-actor fx-charge-actor-over",
        pulse: "fx-charge-pulse fx-charge-pulse-over",
        charged: "overcharged",
        under: `<div class="fx-charge-glow fx-charge-glow-over"></div>` + flames(11, "fx-flame-over") + `<div class="fx-aura-idle fx-aura-idle-over"></div>`,
        over: `<div class="fx-at" style="left:60px;top:60px">${converge(14, "fx-converge-charge fx-converge-over")}</div>` + `<div class="fx-at" style="left:60px;top:58px">${bolts()}</div>`,
      }) +
      afterFighter("right", {}) +
      at(120, 214, `<div class="fx-ground-ring fx-ground-ring-over"></div><div class="fx-ground-ring fx-ground-ring-over" style="animation-delay:220ms"></div>`) +
      at(120, 66, sfx("ゴゴゴ…!!", "fx-sfx-over")),
  }),
};

/* =====================================================================
 * シーン定義・描画
 * ===================================================================== */

const SCENES = [
  { id: "attack", group: "こうげき", title: "こうげき（通常）", ms: 850, color: "#dc2626" },
  { id: "attackCharged", group: "こうげき", title: "こうげき（チャージ中）", ms: 850, color: "#dc2626" },
  { id: "barrierWall", group: "バリア", title: "バリア展開", ms: 750, color: "#ea580c" },
  { id: "barrierBreak", group: "バリア", title: "バリアが割れる（こうげき vs バリア）", ms: 850, color: "#ea580c" },
  { id: "barrierClash", group: "バリア", title: "バリア同士の衝突", ms: 750, color: "#ea580c" },
  { id: "magicReflect", group: "バリア", title: "まほう反射（まほう vs バリア）", ms: 850, color: "#ea580c" },
  { id: "barrierBashCharge", group: "バリア", title: "バリアをぶつける（バリア vs チャージ）", ms: 850, color: "#ea580c" },
  { id: "barrierBashParalysis", group: "バリア", title: "バリアをぶつける（バリア vs まひ）", ms: 850, color: "#ea580c" },
  { id: "magicWeak", group: "まほう", title: "弱まほう", ms: 850, color: "#2563eb" },
  { id: "magicStrong", group: "まほう", title: "強まほう", ms: 850, color: "#7c3aed" },
  { id: "charge", group: "チャージ", title: "チャージ（charged）", ms: 800, color: "#16a34a" },
  { id: "overcharge", group: "チャージ", title: "オーバーチャージ（overcharged）", ms: 800, color: "#16a34a" },
  { id: "paralysis", group: "まひ", title: "まひで動けない", ms: 850, color: "#6b7280" },
];

function renderStage(stageEl, sceneId, variant) {
  const builders = variant === "before" ? BEFORE : AFTER;
  if (!Object.hasOwn(builders, sceneId)) return;
  const scene = builders[sceneId]();
  const world = stageEl.querySelector(".fx-world");
  world.className = `fx-world ${scene.world ?? ""}`;
  world.style.animation = scene.shake ?? "";
  world.style.setProperty("--hit", `${scene.hit ?? 0}ms`);
  world.innerHTML = scene.html;
}

function stageMarkup(sceneId, variant) {
  return `<div class="fx-stage" data-scene="${sceneId}" data-variant="${variant}">
    <div class="fx-floor"></div>
    <div class="fx-world"></div>
    <div class="fx-tag fx-tag-${variant}">${variant === "before" ? "BEFORE（現行）" : "AFTER（提案）"}</div>
  </div>`;
}

function replay(card) {
  card.querySelectorAll(".fx-stage").forEach((stage) => {
    stage.querySelector(".fx-world").innerHTML = "";
    void stage.offsetWidth;
    renderStage(stage, stage.dataset.scene, stage.dataset.variant);
  });
}

function main() {
  const params = new URLSearchParams(location.search);
  if (params.get("reduced") === "1") document.documentElement.classList.add("fx-reduced");
  const root = document.getElementById("scenes");

  // 撮影モード: ?scene=attack&variant=after&capture=1
  if (params.get("capture") === "1") {
    document.documentElement.classList.add("fx-capture");
    const sceneId = SCENES.find((s) => s.id === params.get("scene"))?.id ?? SCENES[0].id;
    const variant = params.get("variant") === "before" ? "before" : "after";
    root.innerHTML = stageMarkup(sceneId, variant);
    renderStage(root.querySelector(".fx-stage"), sceneId, variant);
    window.__fxReady = true;
    return;
  }

  let lastGroup = "";
  root.innerHTML = SCENES.map((s) => {
    const heading = s.group !== lastGroup ? `<h2 class="fx-group" style="--c:${s.color}">${s.group}</h2>` : "";
    lastGroup = s.group;
    return `${heading}<section class="fx-card" data-scene="${s.id}">
      <header><h3>${s.title}</h3><span class="fx-ms">AFTER 演出 ${s.ms}ms</span><button type="button" class="fx-replay">▶ もう一度</button></header>
      <div class="fx-pair">${stageMarkup(s.id, "before")}${stageMarkup(s.id, "after")}</div>
    </section>`;
  }).join("");

  root.querySelectorAll(".fx-card").forEach((card) => {
    replay(card);
    card.querySelector(".fx-replay").addEventListener("click", () => replay(card));
  });

  const loop = document.getElementById("loop");
  let timer = null;
  const setLoop = (on) => {
    clearInterval(timer);
    if (on) timer = setInterval(() => root.querySelectorAll(".fx-card").forEach(replay), 1900);
  };
  loop?.addEventListener("change", () => setLoop(loop.checked));
  setLoop(loop?.checked);
  document.getElementById("replay-all")?.addEventListener("click", () => root.querySelectorAll(".fx-card").forEach(replay));
}

main();
