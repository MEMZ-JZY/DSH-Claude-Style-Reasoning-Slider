window.__ModuleLoader__.load({
  id: "dsh-client-ui-effort-slider",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const LEVELS = [
  { label: "Off", canonical: "off" },
  { label: "Low", canonical: "low" },
  { label: "Medium", canonical: "medium" },
  { label: "High", canonical: "high" },
  { label: "Extra", canonical: "extra" },
  { label: "Max", canonical: "max" },
];

// 滑动变祖器（梁）feature：六档固定绑定六段，段首帧号 0/6/12/18/24/30，
// 拖动时帧号随连续值逐帧变化，松手吸附后停在段首帧。
const LIANG_STAGES = ["小难梁", "牢梁", "梁子", "梁圣", "梁神", "梁祖"];
const LIANG_MAX_FRAME = 30;

// Level identity: non-Max slots are deliberately monochrome — a very subtle
// neutral gray that barely deepens with level, so the slider reads clean and
// the only color moment is Max, which keeps its vivid violet identity (pixel
// field + flowing gradient label). SOFT/DEEP are the lighter and darker poles
// used by fills and shadows.
const LEVEL_COLORS = [
  [158, 158, 158], // Off
  [151, 151, 151], // Low
  [144, 144, 144], // Medium
  [192, 186, 236], // High — light periwinkle
  [186, 176, 232], // Extra
  [182, 156, 240], // Max — light blue-purple
];
const LEVEL_COLORS_SOFT = [
  [214, 214, 214],
  [210, 210, 210],
  [206, 206, 206],
  [212, 208, 242],
  [208, 202, 240],
  [206, 184, 244],
];
const LEVEL_COLORS_DEEP = [
  [120, 120, 120],
  [114, 114, 114],
  [108, 108, 108],
  [124, 110, 190],
  [120, 102, 186],
  [114, 74, 198],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0, edge1, value) => {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

const mix = (from, to, amount) => from + (to - from) * amount;
const mixColor = (from, to, amount) =>
  `rgb(${Math.round(mix(from[0], to[0], amount))} ${Math.round(
    mix(from[1], to[1], amount),
  )} ${Math.round(mix(from[2], to[2], amount))})`;

const rgb = (color) =>
  `rgb(${Math.round(color[0])} ${Math.round(color[1])} ${Math.round(color[2])})`;

const interpColor = (a, b, t) => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

let instanceCount = 0;

// Timing adapter. The Web Component never touches native browser timer globals
// directly; it calls this adapter. In the dynamic DSH client half, apply()
// injects a timer-service-backed adapter. Standalone (normal browser) uses the
// native bootstrap appended at the bottom of this file. The default is a safe
// no-op so an embedded copy can never crash on restricted timer globals.
let effortTiming = {
  timeout() { return () => {}; },
  interval() { return () => {}; },
  raf() { return () => {}; },
};

class DsEffortSlider extends HTMLElement {
  static get observedAttributes() {
    return [
      "value", "open", "disabled", "supported", "inline",
      "default-active", "label", "axis-low", "axis-high", "tooltip",
      "input-aria-label", "help-aria-label",
      "liang", "liang-asset-base", "liang-label",
      "chibi", "chibi-sprite",
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = `ds-effort-${++instanceCount}`;
    this._value = 0;
    this._levelIndex = 0;
    this._levels = LEVELS;
    this._ticks = [];
    this._dragging = false;
    this._canvasFrame = 0;
    this._fieldMode = null;
    this._rippleStart = 0;
    this._labelFrame = 0;
    this._labelTimer = 0;
    this._closeTimer = 0;
    this._lastCanvasFrame = 0;
    this._maxStartedAt = 0;
    this._reveal = 0;
    this._isMax = false;
    this._reflectingValue = false;
    this._defaultActive = false;
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // 梁 feature 状态
    this._liangFrame = 0;
    this._liangAssetBase = "/effort-slider-assets/liang-frames/";
    this._liangLabel = "滑动变祖器";
    // 大肥鱼 thumb feature 状态（帧循环由 CSS keyframes 驱动）
    this._chibiSprite = "/effort-slider-assets/chibi-runner-strip.png";

    this.shadowRoot.innerHTML = `
      <style>
        @property --ds-effort-progress {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }

        @property --ds-effort-level-color {
          syntax: "<color>";
          inherits: true;
          initial-value: #9e9e9e;
        }

        @property --ds-effort-level-soft {
          syntax: "<color>";
          inherits: true;
          initial-value: #d6d6d6;
        }

        @property --ds-effort-level-deep {
          syntax: "<color>";
          inherits: true;
          initial-value: #787878;
        }

        :host {
          --ds-effort-accent: var(--dsw-alias-brand-primary, #8c73c9);
          --ds-effort-accent-deep: var(--dsw-alias-brand-primary-hover, #a17ec2);
          --ds-effort-text: var(--dsw-alias-label-secondary, #5f5b58);
          --ds-effort-text-strong: var(--dsw-alias-label-primary, #3f3b38);
          --ds-effort-muted: var(--dsw-alias-label-tertiary, #77736f);
          --ds-effort-track: var(--dsw-alias-bg-layer-2, #edeae8);
          --ds-effort-track-fill: var(--dsw-alias-bg-layer-3, #e0dbd6);
          --ds-effort-progress: 0;
          --ds-effort-thumb-w: 1.5rem;
          --ds-effort-thumb-h: 1.625rem;
          --ds-effort-thumb-inset: 2px;
          --ds-effort-track-pad: 1px;
          --ds-effort-track-radius: 0.625rem;
          --ds-effort-surface: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #ffffff));
          --ds-effort-outline: var(--dsw-alias-border-l1, rgba(76, 70, 65, 0.12));
          --ds-effort-blue: #2788d6;
          --ds-effort-level-color: #9e9e9e;
          --ds-effort-level-soft: #d6d6d6;
          --ds-effort-level-deep: #787878;
          --light-color: #d3dcf8;
          --light-x: 50%;
          --light-y: 50%;
          --light-strength: 0;
          --ds-effort-width: min(21rem, calc(100vw - 2rem));
          --ease-decay: cubic-bezier(0.2, 0, 0, 1);
          transition-property:
            --ds-effort-progress,
            --ds-effort-level-color,
            --ds-effort-level-soft,
            --ds-effort-level-deep;
          transition-duration: 360ms;
          transition-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
          display: block;
          width: var(--ds-effort-width);
          max-width: 100%;
          color: var(--ds-effort-text);
          font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 1rem;
          line-height: 1.4;
          font-synthesis: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        :host([data-dragging]) {
          transition-duration: 0ms;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        button, input {
          font: inherit;
        }

        .shell {
          position: relative;
          width: 100%;
          min-height: 2.5rem;
        }

        .panel {
          position: absolute;
          z-index: 4;
          right: 0;
          bottom: 3.25rem;
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--ds-effort-outline);
          border-radius: 1rem;
          background: color-mix(in srgb, var(--ds-effort-surface) 88%, transparent);
          -webkit-backdrop-filter: blur(10px) saturate(1.3);
          backdrop-filter: blur(10px) saturate(1.3);
          box-shadow:
            0 1px 2px rgba(62, 56, 50, 0.05),
            0 4px 10px rgba(62, 56, 50, 0.04),
            0 12px 28px rgba(62, 56, 50, 0.06);
          opacity: 1;
          transform: translateY(0);
          transform-origin: bottom right;
          transition-property: opacity, transform;
          transition-duration: 120ms;
          transition-timing-function: ease-in;
        }

        :host([open]) .panel {
          animation: ds-effort-panel-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }

        @keyframes ds-effort-panel-in {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.97);
          }
        }

        :host(:not([open]):not([data-closing])) .panel {
          display: none;
        }

        :host([data-closing]) .panel {
          pointer-events: none;
          opacity: 0;
          transform: translateY(2px);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 1.75rem;
          gap: 0.75rem;
        }

        .title {
          display: flex;
          align-items: baseline;
          min-width: 0;
          color: var(--ds-effort-text);
          font-size: 1rem;
          font-weight: 500;
          line-height: 1.3;
          letter-spacing: -0.01em;
          text-wrap: balance;
        }

        .level-stage {
          position: relative;
          display: inline-block;
          height: 1.3em;
          margin-left: 0.375rem;
          color: var(--ds-effort-text-strong);
          line-height: inherit;
          vertical-align: baseline;
        }

        .level-stage::after {
          content: attr(data-current);
          visibility: hidden;
          white-space: nowrap;
        }

        .level-stage > span {
          position: absolute;
          top: 0;
          left: 0;
          line-height: inherit;
          white-space: nowrap;
          transform-origin: left center;
        }

        .level-current,
        .level-outgoing {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
          transition-property: opacity, transform, filter, color;
          transition-duration: 260ms;
          transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }

        .level-current {
          transition-delay: 24ms;
        }

        .level-current.is-preparing {
          opacity: 0;
          transform: translateY(var(--label-enter-y, 3px));
          filter: blur(2px);
          transition-duration: 0ms;
          transition-delay: 0ms;
        }

        .level-outgoing {
          pointer-events: none;
          transition-delay: 0ms;
        }

        .level-outgoing.is-exiting {
          opacity: 0;
          transform: translateY(var(--label-exit-y, -3px));
          filter: blur(2px);
        }

        :host([data-glow]) .level-current {
          color: var(--ds-effort-level-color);
        }

        :host([data-level="3"]) .level-current {
          background: linear-gradient(90deg, #9ec2ff, #6aa2ff, #9ec2ff);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ds-effort-level-flow 4s linear infinite;
          transition-property: opacity, transform, filter;
        }

        :host([data-level="4"]) .level-current {
          background: linear-gradient(90deg, #c79bfb, #ad79f6, #c79bfb);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ds-effort-level-flow 4s linear infinite;
          transition-property: opacity, transform, filter;
        }

        :host([data-max]) .level-current,
        :host([data-max]) .trigger-value {
          background: linear-gradient(90deg, #c9b9ea, #ae9aef, #a2c1ff, #c5b0f4, #c9b9ea);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: ds-effort-level-flow 3.2s linear infinite;
          transition-property: opacity, transform, filter;
        }

        @keyframes ds-effort-level-flow {
          to { background-position: 200% center; }
        }

        .help-wrap {
          position: relative;
          flex: 0 0 auto;
        }

        .help-button {
          position: relative;
          display: grid;
          width: 2.75rem;
          height: 2.75rem;
          margin: -0.375rem;
          padding: 0.375rem;
          place-items: center;
          border: 0;
          border-radius: 0.5rem;
          background: transparent;
          color: var(--ds-effort-muted);
          cursor: help;
          transition-property: color, background-color, scale;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
        }

        .help-button:hover {
          color: #74706d;
          background: rgba(82, 76, 70, 0.055);
        }

        .help-button:active {
          scale: 0.96;
        }

        .help-button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--ds-effort-accent) 35%, transparent);
          outline-offset: 2px;
        }

        .help-button svg {
          width: 1rem;
          height: 1rem;
        }

        .tooltip {
          position: absolute;
          z-index: 8;
          top: calc(100% + 0.375rem);
          right: 0;
          width: min(16rem, calc(100vw - 2rem));
          padding: 0.5rem 0.625rem;
          border: 1px solid rgba(76, 70, 65, 0.1);
          border-radius: 0.5rem;
          background: #34312f;
          box-shadow:
            0 2px 5px rgba(35, 31, 29, 0.12),
            0 8px 18px rgba(35, 31, 29, 0.12);
          color: #fff;
          font-size: 0.8125rem;
          font-weight: 450;
          line-height: 1.45;
          text-wrap: pretty;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-2px);
          transition-property: opacity, transform, visibility;
          transition-duration: 120ms;
          transition-timing-function: ease-in;
        }

        .help-wrap:hover .tooltip,
        .help-button:focus-visible + .tooltip,
        .help-wrap[data-tip-open] .tooltip {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          transition-timing-function: ease-out;
        }

        .axis {
          display: flex;
          justify-content: space-between;
          margin-top: 0.75rem;
          color: var(--ds-effort-muted);
          font-size: 0.875rem;
          font-weight: 450;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }

        .track-shell {
          position: relative;
          height: 2.75rem;
          margin-top: 0.5rem;
        }

        /* ---------- 滑动变祖器（梁）feature ---------- */
        :host([liang]) .panel {
          width: min(21rem, calc(100vw - 2rem));
        }

        .liang-portrait {
          position: relative;
          width: 14rem;
          max-width: 100%;
          margin: 0.625rem auto 0;
          border-radius: 0.75rem;
          overflow: hidden;
          border: 1px solid var(--ds-effort-outline);
          background: #1d1918;
          aspect-ratio: 1 / 1;
        }

        .liang-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }

        /* 原版扫描线 + 光斑质感 */
        .liang-portrait::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            repeating-linear-gradient(
              0deg,
              rgb(255 255 255 / 2.5%) 0 1px,
              transparent 1px 4px
            ),
            radial-gradient(circle at 22% 18%, rgb(255 255 255 / 8%) 0 1px, transparent 1.5px);
          background-size: auto, 7px 7px;
          mix-blend-mode: soft-light;
          opacity: 0.35;
        }

        .liang-stage {
          font-family: "Songti SC", STSong, "SimSun", serif;
          font-size: 1.375rem;
          font-weight: 700;
          line-height: 1.75rem;
          color: var(--ds-effort-text-strong);
        }

        /* 圆点指示灯 + 文字开关 */
        .liang-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          margin-top: 0.375rem;
          padding: 0.125rem 0.25rem;
          border: 0;
          border-radius: 0.375rem;
          background: transparent;
          color: var(--ds-effort-muted);
          font-size: 0.6875rem;
          font-weight: 500;
          line-height: 1.2;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition-property: color;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
        }

        .liang-toggle:hover {
          color: var(--ds-effort-text);
        }

        .liang-toggle:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--ds-effort-accent) 35%, transparent);
          outline-offset: 2px;
        }

        .liang-toggle .liang-dot {
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 999px;
          background: #b6b2af;
          opacity: 0.7;
          transition-property: background-color, box-shadow, opacity;
          transition-duration: 180ms;
          transition-timing-function: ease-out;
        }

        :host([liang]) .liang-toggle {
          color: var(--ds-effort-accent);
        }

        :host([liang]) .liang-toggle .liang-dot {
          background: var(--ds-effort-accent);
          box-shadow: 0 0 6px color-mix(in srgb, var(--ds-effort-accent) 65%, transparent);
          opacity: 1;
        }

        .track {
          position: absolute;
          inset: 0.5rem 0;
          overflow: hidden;
          border-radius: var(--ds-effort-track-radius);
          background-color: var(--ds-effort-track);
          box-shadow:
            inset 0 1px 1px rgba(70, 64, 59, 0.05),
            inset 0 -1px 0 rgba(255, 255, 255, 0.55);
        }

        /* subtle fractal noise breaks up flat-color banding; sits between the
           track background and the fill/canvas so it never dulls the pixels */
        .track::after {
          content: "";
          position: absolute;
          z-index: -1;
          inset: 0;
          border-radius: inherit;
          opacity: 0.05;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='28'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='28' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
        }

        /* 光场：内层光极微弱照亮轨道内部，轮廓光稍强照亮轨道边缘 */
        .track-light {
          position: absolute;
          z-index: 0;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background: radial-gradient(
            circle at var(--light-x, 50%) var(--light-y, 50%),
            var(--light-color) 0%,
            transparent 42%
          );
          opacity: calc(var(--light-strength, 0) * 0.25);
          transition: opacity 180ms ease-out;
        }

        /* 轨道外轮廓：鼠标是光源，光打在玻璃边缘 —— 靠近鼠标的边缘
           有白色高光斑，锐利衰减，远处不亮 */
        .track-outline {
          position: absolute;
          z-index: 1;
          top: 0.5rem;
          bottom: 0.5rem;
          left: 0;
          right: 0;
          border-radius: var(--ds-effort-track-radius);
          background: radial-gradient(
            circle at var(--light-x, 50%) var(--light-y, 50%),
            #ffffff 0%,
            var(--light-color) 26%,
            transparent 52%
          );
          -webkit-mask: radial-gradient(ellipse, transparent 0%, transparent calc(100% - 9px), #000 calc(100% - 2px));
          mask: radial-gradient(ellipse, transparent 0%, transparent calc(100% - 9px), #000 calc(100% - 2px));
          opacity: var(--light-strength, 0);
          pointer-events: none;
          transition: opacity 180ms ease-out;
        }

        .thumb-light {
          position: absolute;
          z-index: 0;
          top: 50%;
          left: calc(
            (100% - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
              * var(--ds-effort-progress, 0)
            + var(--ds-effort-thumb-inset)
          );
          width: calc(var(--ds-effort-thumb-w) + 3.5rem);
          height: calc(var(--ds-effort-thumb-h) + 1.75rem);
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, var(--light-color) 0%, transparent 60%);
          opacity: calc(0.1 + var(--light-strength, 0) * 0.06);
          pointer-events: none;
          transition: opacity 180ms ease-out;
        }

        :host([data-max]) .track-light,
        :host([data-max]) .track-outline,
        :host([data-max]) .thumb-light {
          opacity: 0;
        }

        .track-fill {
          position: absolute;
          z-index: 0;
          top: 0;
          bottom: 0;
          left: var(--ds-effort-track-pad);
          width: calc(
            (100% - (var(--ds-effort-track-pad) * 2) - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
              * var(--ds-effort-progress, 0)
            + (var(--ds-effort-thumb-inset) + var(--ds-effort-thumb-w) * 0.5)
          );
          border-radius: calc(var(--ds-effort-track-radius) - 1px) 0 0 calc(var(--ds-effort-track-radius) - 1px);
          background: var(--ds-effort-track-fill);
          pointer-events: none;
          transition-property: opacity;
          transition-duration: 200ms;
          transition-timing-function: var(--ease-decay);
        }

        :host([data-max]) .track-fill {
          opacity: 0;
        }

        :host([data-level="3"]) .track-fill {
          background: radial-gradient(
            ellipse closest-side at var(--fill-x, 50%) 50%,
            rgba(130, 172, 255, 0.24) 0%,
            rgba(130, 172, 255, 0.08) 100%
          );
        }

        :host([data-level="4"]) .track-fill {
          background: radial-gradient(
            ellipse closest-side at var(--fill-x, 50%) 50%,
            rgba(176, 140, 250, 0.24) 0%,
            rgba(176, 140, 250, 0.08) 100%
          );
        }

        .track::before {
          content: "";
          position: absolute;
          z-index: 0;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            #dccdf0 0%,
            #d4c2ee 14%,
            #c8b2e8 32%,
            #b99ee2 52%,
            #aa88dc 72%,
            #9c74d8 88%,
            #8f62d4 100%
          );
          opacity: 0;
          transform-origin: right center;
          transition-property: opacity;
          transition-duration: 340ms;
          transition-timing-function: ease-in;
        }

        :host([data-max]) .track::before {
          opacity: 1;
        }

        .max-fallback,
        .pixel-field {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
          transition-property: opacity;
          transition-duration: 200ms;
          transition-timing-function: var(--ease-decay);
        }

        .max-fallback {
          background: linear-gradient(
            90deg,
            #dccdf0 0%,
            #d4c2ee 14%,
            #c8b2e8 32%,
            #b99ee2 52%,
            #aa88dc 72%,
            #9c74d8 88%,
            #8f62d4 100%
          );
        }

        :host([data-max][data-pixels-ready]) .pixel-field {
          opacity: 1;
        }

        :host([data-field]) .pixel-field {
          opacity: 1;
        }

        .ticks {
          position: absolute;
          z-index: 1;
          inset: 0;
          pointer-events: none;
        }

        .tick {
          position: absolute;
          top: 50%;
          left: calc(
            (100% - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
              * var(--tick-frac, 0)
            + (var(--ds-effort-thumb-inset) + var(--ds-effort-thumb-w) * 0.5)
          );
          width: 0.25rem;
          height: 0.25rem;
          border-radius: 999px;
          background: #b6b2af;
          opacity: 0.82;
          transform: translate(-50%, -50%);
          transition-property: opacity;
          transition-duration: 180ms;
          transition-timing-function: var(--ease-decay);
        }

        .tick[data-disabled] {
          background: rgba(128, 128, 128, 0.22);
          opacity: 0.45;
        }

        .tick.on {
          background: var(--ds-effort-level-color);
          box-shadow: 0 0 4px color-mix(in srgb, var(--ds-effort-level-color) 60%, transparent);
          opacity: 0.95;
        }

        :host([data-max-supported]) .tick:last-child {
          background: var(--ds-effort-accent);
          opacity: 1;
        }

        :host([data-max]) .tick {
          opacity: 0;
        }

        .range {
          position: absolute;
          z-index: 3;
          inset: 0 var(--ds-effort-track-pad);
          width: calc(100% - var(--ds-effort-track-pad) * 2);
          height: 100%;
          margin: 0;
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          outline: 0;
          background: transparent;
          cursor: ew-resize;
          touch-action: none;
        }

        .range::-webkit-slider-runnable-track {
          height: var(--ds-effort-thumb-h);
          border: 0;
          background: transparent;
        }

        .range::-webkit-slider-thumb {
          width: 1px;
          height: 1px;
          margin-top: 0;
          appearance: none;
          -webkit-appearance: none;
          border: 0;
          border-radius: 0;
          background: transparent;
          opacity: 0;
          pointer-events: none;
        }

        .range::-moz-range-track {
          height: var(--ds-effort-thumb-h);
          border: 0;
          background: transparent;
        }

        .range::-moz-range-progress {
          background: transparent;
        }

        .range::-moz-range-thumb {
          width: 1px;
          height: 1px;
          border: 0;
          border-radius: 0;
          background: transparent;
          opacity: 0;
          pointer-events: none;
        }

        .thumb {
          position: absolute;
          z-index: 2;
          top: 50%;
          left: calc(
            (100% - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
              * var(--ds-effort-progress, 0)
            + var(--ds-effort-thumb-inset)
          );
          width: var(--ds-effort-thumb-w);
          height: var(--ds-effort-thumb-h);
          border: 1px solid rgba(76, 70, 65, 0.15);
          border-radius: 0.5rem;
          background: linear-gradient(
            180deg,
            #ffffff,
            color-mix(in srgb, var(--ds-effort-level-soft) 22%, #ffffff) 52%,
            color-mix(in srgb, var(--ds-effort-level-soft) 42%, #f5f4f2)
          );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            inset 0 -1px 1px rgba(76, 70, 65, 0.05),
            0 1px 2px rgba(62, 56, 50, 0.1),
            0 4px 10px rgba(62, 56, 50, 0.06);
          pointer-events: none;
          transform: translateY(-50%);
          transition-property: transform, box-shadow, background, border-color;
          transition-duration: 180ms;
          transition-timing-function: ease-out;
        }

        .thumb::before,
        .thumb::after {
          content: "";
          position: absolute;
          top: 50%;
          width: 1px;
          height: 38%;
          border-radius: 999px;
          background: rgba(76, 70, 65, 0.2);
          opacity: 0;
          transform: translateY(-50%);
          transition-property: opacity;
          transition-duration: 140ms;
          transition-timing-function: ease-out;
        }

        .thumb::before { left: 42%; }
        .thumb::after { right: 42%; }

        :host(:hover) .thumb::before,
        :host(:hover) .thumb::after,
        :host(:focus-within) .thumb::before,
        :host(:focus-within) .thumb::after,
        :host([data-dragging]) .thumb::before,
        :host([data-dragging]) .thumb::after {
          opacity: 1;
        }

        :host([data-dragging]) .thumb {
          transform: translateY(-50%) scale(0.96);
          transition-property: none;
        }

        :host(:focus-within) .thumb {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            inset 0 -1px 1px rgba(76, 70, 65, 0.05),
            0 0 0 3px color-mix(in srgb, var(--ds-effort-accent) 30%, transparent),
            0 1px 2px rgba(62, 56, 50, 0.1),
            0 4px 10px rgba(62, 56, 50, 0.06);
        }

        :host([data-glow]) .thumb {
          border-color: color-mix(in srgb, var(--ds-effort-level-color) 50%, transparent);
          background: linear-gradient(
            180deg,
            #ffffff,
            color-mix(in srgb, var(--ds-effort-level-soft) 34%, #ffffff) 55%,
            color-mix(in srgb, var(--ds-effort-level-soft) 58%, #f0eeec)
          );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            inset 0 -1px 1px color-mix(in srgb, var(--ds-effort-level-deep) 10%, transparent),
            0 1px 2px rgba(62, 56, 50, 0.1),
            0 4px 10px rgba(62, 56, 50, 0.06);
        }

        :host([disabled]) {
          opacity: 0.58;
        }

        /* ---------- 大肥鱼 thumb feature ---------- */
        /* 精灵图 8 帧横向排布；thumb 变为高个子奔跑小人，
           与 dsh-reasoning-effort 的大肥鱼逻辑一致：
           静止 720ms 循环，拖拽 420ms 加速，reduced-motion 停帧。
           尺寸变量放在 :host 级，轨道内其它元素共享同一几何。 */
        :host([chibi]) {
          --ds-effort-thumb-w: 2.5rem;
          --ds-effort-thumb-h: 3.4375rem;
        }

        :host([chibi]) .thumb {
          /* 左端与普通 thumb 对齐（inset 贴边）；仅限制右端防小人溢出 */
          left: min(
            calc(
              (100% - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
                * var(--ds-effort-progress, 0)
              + var(--ds-effort-thumb-inset)
            ),
            calc(100% - var(--ds-effort-thumb-w) * 0.5)
          );
          border: 0;
          border-radius: 0.5rem;
          background-color: transparent;
          background-image: var(--chibi-sprite, url("/effort-slider-assets/chibi-runner-strip.png"));
          background-repeat: no-repeat;
          background-position: 0 0;
          background-size: 800% 100%;
          box-shadow: none;
          filter:
            drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28))
            drop-shadow(0 0 5px rgba(92, 105, 255, 0.34));
          animation: ds-effort-chibi-run 720ms step-end infinite;
          transform: translateY(-50%);
          transform-origin: 50% 68%;
        }

        :host([chibi][data-dragging]) .thumb {
          animation-duration: 420ms;
          transform: translateY(-50%) scale(1.07);
          filter:
            drop-shadow(0 2px 1px rgba(0, 0, 0, 0.28))
            drop-shadow(0 0 8px rgba(87, 137, 255, 0.68));
          transition-property: none;
        }

        :host([chibi]) .thumb::before,
        :host([chibi]) .thumb::after {
          display: none;
        }

        @keyframes ds-effort-chibi-run {
          0%   { background-position: 0 0; }
          12.5%  { background-position: 14.285714% 0; }
          25%    { background-position: 28.571429% 0; }
          37.5%  { background-position: 42.857143% 0; }
          50%    { background-position: 57.142857% 0; }
          62.5%  { background-position: 71.428571% 0; }
          75%    { background-position: 85.714286% 0; }
          87.5%, 100% { background-position: 100% 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          :host([chibi]) .thumb {
            animation: none;
          }
        }

        :host([disabled]) .range,
        :host([disabled]) button {
          cursor: not-allowed;
        }

        .anchor-row {
          position: relative;
          z-index: 2;
          display: flex;
          min-height: 2.5rem;
          align-items: center;
          justify-content: center;
          padding: 0 2px;
        }

        .trigger {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          width: max-content;
          min-width: 0;
          min-height: 2.75rem;
          padding: 0.375rem 0.75rem;
          border: 0;
          border-radius: 0.5rem;
          background: #efefed;
          box-shadow:
            inset 0 0 0 1px rgba(76, 70, 65, 0.045),
            0 1px 2px rgba(62, 56, 50, 0.035);
          color: var(--ds-effort-text-strong);
          font-size: 0.875rem;
          font-weight: 500;
          line-height: 1.25;
          white-space: nowrap;
          cursor: pointer;
          transition-property: background-color, scale;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
        }

        .trigger:hover {
          background: #e7e6e3;
        }

        .trigger:active {
          scale: 0.96;
        }

        .trigger:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--ds-effort-accent) 32%, transparent);
          outline-offset: 2px;
        }

        .trigger-value {
          font-variant-numeric: tabular-nums;
        }

        .trigger-bars {
          display: inline-flex;
          align-items: flex-end;
          gap: 2px;
          height: 0.875rem;
          flex: none;
        }

        .trigger-bar {
          width: 3px;
          border-radius: 1px;
          background: var(--ds-effort-track-fill);
          opacity: 0.85;
          transition-property: background-color, box-shadow;
          transition-duration: 180ms;
          transition-timing-function: var(--ease-decay);
        }

        .trigger-bar:nth-child(1) { height: 30%; }
        .trigger-bar:nth-child(2) { height: 44%; }
        .trigger-bar:nth-child(3) { height: 58%; }
        .trigger-bar:nth-child(4) { height: 72%; }
        .trigger-bar:nth-child(5) { height: 86%; }
        .trigger-bar:nth-child(6) { height: 100%; }

        .trigger-bar.on {
          background: var(--ds-effort-level-color);
          box-shadow: 0 0 5px color-mix(in srgb, var(--ds-effort-level-color) 55%, transparent);
        }

        :host([inline]) {
          --ds-effort-width: 100%;
        }

        :host([inline]) .shell {
          min-height: auto;
        }

        :host([inline]) .anchor-row {
          display: none;
        }

        :host([inline]) .panel {
          position: static;
          display: block !important;
          opacity: 1;
          transform: none;
          transform-origin: initial;
          width: 100%;
          padding: 0.5rem 0 0.75rem;
          border: 0;
          border-radius: 0;
          background: transparent;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          box-shadow: none;
          pointer-events: auto;
        }

        :host([inline]) .header {
          min-height: auto;
        }

        :host([inline]) .header {
          min-height: auto;
        }

        :host([inline]) .title > span:first-child {
          display: none;
        }

        :host([inline]) .level-stage {
          margin-left: 0;
        }

        :host([inline]) .axis {
          margin-top: 0.375rem;
        }

        :host([inline]) .track-shell {
          margin-top: 0.375rem;
        }

        :host([inline]) .track-shell {
          margin-top: 0.375rem;
        }

        :host([inline]) .track {
          box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1, rgba(76, 70, 65, 0.12));
        }

        :host([inline]) .tick {
          opacity: 1;
        }

        :host([inline]) .help-button {
          width: 2rem;
          height: 2rem;
        }

       @media (max-width: 479px) {
          :host {
            --ds-effort-width: calc(100vw - 1.5rem);
          }

          .panel {
            bottom: 3rem;
            padding: 0.875rem 1rem;
            border-radius: 0.875rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          :host,
          .level-current,
          .level-outgoing,
          .panel,
          .track::before,
          .track-fill,
          .track-light,
          .track-outline,
          .thumb-light,
          .range::-webkit-slider-thumb,
          .range::-moz-range-thumb,
          .trigger,
          .trigger-bar,
          .thumb,
          .help-button,
          .tooltip {
            transition-duration: 0.001ms;
          }

          :host([data-max]) .max-fallback {
            opacity: 1;
          }

          :host([data-max]) .level-current,
          :host([data-max]) .trigger-value {
            background: none;
            color: var(--ds-effort-accent);
            animation: none;
          }

          :host([data-level="3"]) .level-current,
          :host([data-level="4"]) .level-current {
            background: none;
            color: var(--ds-effort-level-color);
            animation: none;
          }

          :host([open]) .panel {
            animation: none;
          }

          .pixel-field {
            display: none;
          }
        }
      </style>

      <div class="shell">
        <div class="anchor-row">
          <button
            class="trigger"
            type="button"
            aria-controls="${this._uid}-panel"
            aria-expanded="false"
            aria-label="Effort level: Default"
          >
            <span class="trigger-value">Default</span>
            <span class="trigger-bars" aria-hidden="true">
              ${LEVELS.map(() => '<span class="trigger-bar"></span>').join("")}
            </span>
          </button>
        </div>

        <section class="panel" id="${this._uid}-panel" aria-label="Effort settings">
          <div class="header">
            <div class="title">
              <span>Effort</span>
              <span class="level-stage" aria-live="polite" aria-atomic="true">
                <span class="level-outgoing" aria-hidden="true"></span>
                <span class="level-current">Off</span>
              </span>
            </div>
            <div class="help-wrap">
              <button class="help-button" type="button" aria-label="About effort levels" aria-describedby="${this._uid}-tooltip">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
                  <path d="M9.8 9.2a2.35 2.35 0 0 1 4.55.82c0 1.8-2.35 2.05-2.35 3.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M12 17.2h.01" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
              </button>
              <div class="tooltip" id="${this._uid}-tooltip" role="tooltip">
                Higher effort spends more time reasoning. Max adds the deepest analysis and code pass.
              </div>
            </div>
          </div>

          <div class="axis" aria-hidden="true">
            <span>Faster</span>
            <span>Smarter</span>
          </div>

          <div class="liang-portrait" hidden>
            <canvas class="liang-canvas" role="img" aria-label="梁系强度人像"></canvas>
          </div>
          <div class="track-shell">
            <div class="track" aria-hidden="true">
              <div class="track-fill"></div>
              <div class="max-fallback"></div>
              <canvas class="pixel-field"></canvas>
              <div class="ticks"></div>
              <div class="track-light"></div>
              <div class="thumb-light"></div>
              <div class="thumb"></div>
            </div>
            <div class="track-outline" aria-hidden="true"></div>
            <input
              class="range"
              type="range"
              min="0"
              max="5"
              step="0.001"
              value="0"
              aria-label="Effort level"
              aria-valuemin="0"
              aria-valuemax="5"
              aria-valuetext="Default"
            />
          </div>

          <button class="liang-toggle" type="button" role="switch" aria-label="滑动变祖器" aria-checked="false">
            <span class="liang-dot" aria-hidden="true"></span>
            <span class="liang-toggle-label">滑动变祖器</span>
          </button>
        </section>
      </div>
    `;

    this._panel = this.shadowRoot.querySelector(".panel");
    this._input = this.shadowRoot.querySelector(".range");
    this._track = this.shadowRoot.querySelector(".track");
    this._canvas = this.shadowRoot.querySelector(".pixel-field");
    this._ticksEl = this.shadowRoot.querySelector(".ticks");
    this._thumb = this.shadowRoot.querySelector(".thumb");
    this._currentLabel = this.shadowRoot.querySelector(".level-current");
    this._outgoingLabel = this.shadowRoot.querySelector(".level-outgoing");
    this._levelStage = this.shadowRoot.querySelector(".level-stage");
    this._titlePrefix = this.shadowRoot.querySelector(".title > span:first-child");
    this._axisLow = this.shadowRoot.querySelector(".axis span:first-child");
    this._axisHigh = this.shadowRoot.querySelector(".axis span:last-child");
    this._tooltipText = this.shadowRoot.querySelector(".tooltip");
    this._trigger = this.shadowRoot.querySelector(".trigger");
    this._triggerValue = this.shadowRoot.querySelector(".trigger-value");
    this._bars = this.shadowRoot.querySelectorAll(".trigger-bar");
    this._helpWrap = this.shadowRoot.querySelector(".help-wrap");
    this._helpButton = this.shadowRoot.querySelector(".help-button");
    this._liangPortrait = this.shadowRoot.querySelector(".liang-portrait");
    this._liangCanvas = this.shadowRoot.querySelector(".liang-canvas");
    this._liangToggle = this.shadowRoot.querySelector(".liang-toggle");
    this._liangToggleLabel = this.shadowRoot.querySelector(".liang-toggle-label");
    this._liangImages = new Map();

    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
    this._onReducedMotionChange = this._onReducedMotionChange.bind(this);
  }

  connectedCallback() {
    this._events?.abort();
    this._events = new AbortController();
    const { signal } = this._events;
    this._defaultActive = this.hasAttribute("default-active");
    this._syncLevels();
    const initialValue = Number.parseFloat(this.getAttribute("value") ?? "0");
    this._setValue(Number.isFinite(initialValue) ? initialValue : 0, {
      animateLabel: false,
      reflect: false,
    });
   this._syncOpenState();
   this._syncDisabledState();
   this._parseSupported();
    this._syncInlineState();
    this._syncTexts();
    this._syncLiang();
    this._syncChibi();

    this._input.addEventListener("pointerdown", (event) => this._onPointerDown(event), { signal });
    this._input.addEventListener("pointerup", (event) => this._onPointerUp(event), { signal });
    this._input.addEventListener("pointercancel", (event) => this._onPointerUp(event), { signal });
    this._input.addEventListener("input", () => this._onInput(), { signal });
    this._input.addEventListener("keydown", (event) => this._onKeyDown(event), { signal });
    this._trigger.addEventListener("click", () => this.toggle(), { signal });
    this._helpButton.addEventListener("click", () => {
      if (this.disabled) return;
      this._helpWrap.toggleAttribute("data-tip-open");
    }, { signal });
    this._liangToggle.addEventListener("click", () => {
      if (this.disabled) return;
      this.liang = !this.liang;
      this.dispatchEvent(
        new CustomEvent("ds-liang-toggle", {
          bubbles: true,
          composed: true,
          detail: { enabled: this.liang },
        }),
      );
    }, { signal });
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open && !this.hasAttribute("inline")) {
        event.preventDefault();
        this.close();
        this._trigger.focus();
      }
    }, { signal });
    // 鼠标靠近轨道时移动光场；离开后恢复
    this._panel.addEventListener("pointermove", (event) => {
      const rect = this._track.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const lx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const ly = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const dist = Math.max(
        event.clientY < rect.top ? rect.top - event.clientY : Math.max(0, event.clientY - rect.bottom),
        event.clientX < rect.left ? rect.left - event.clientX : Math.max(0, event.clientX - rect.right),
      );
      const strength = clamp(1 - dist / 70, 0, 1);
      this.style.setProperty("--light-x", `${(lx * 100).toFixed(1)}%`);
      this.style.setProperty("--light-y", `${(ly * 100).toFixed(1)}%`);
      this.style.setProperty("--light-strength", strength.toFixed(3));
    }, { signal });
    this._panel.addEventListener("pointerleave", () => {
      this.style.setProperty("--light-strength", "0");
    }, { signal });

    document.addEventListener("pointerdown", this._onDocumentPointerDown, true);
    this._reducedMotion.addEventListener("change", this._onReducedMotionChange);
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this._track);
    this._resizeCanvas();
    if (this._isMax) this._ensureCanvasLoop();
  }

  disconnectedCallback() {
    this._events?.abort();
    document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    this._reducedMotion.removeEventListener("change", this._onReducedMotionChange);
    this._resizeObserver?.disconnect();
    this._cancelTimer("_canvasFrame");
    this._fieldMode = null;
    this.removeAttribute("data-field");
    this._cancelTimer("_labelFrame");
    this._cancelTimer("_labelTimer");
    this._cancelTimer("_closeTimer");
    this._lastCanvasFrame = 0;
    this._dragging = false;
    this.removeAttribute("data-closing");
    this.removeAttribute("data-dragging");
    this._panel.hidden = !this.open;
    this._currentLabel.classList.remove("is-preparing");
    this._outgoingLabel.classList.remove("is-exiting");
    this._outgoingLabel.textContent = "";
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === "value" && !this._reflectingValue && this._input) {
      const next = Number.parseFloat(newValue ?? "0");
      this._setValue(Number.isFinite(next) ? next : 0, {
        animateLabel: this.isConnected,
        reflect: false,
      });
    }
    if (name === "open" && this._trigger) this._syncOpenState();
    if (name === "disabled" && this._input) this._syncDisabledState();
    if (name === "inline" && this._panel) this._syncInlineState();
    if (
      name === "label" || name === "axis-low" || name === "axis-high" ||
      name === "tooltip" || name === "input-aria-label" || name === "help-aria-label"
    ) {
      this._syncTexts();
    }
    if (name === "supported") this._parseSupported();
    if (name === "default-active") {
      this._defaultActive = this.hasAttribute("default-active");
      this._parseSupported();
      this._applyLevelLabel();
      if (this._input) {
        this._input.setAttribute("aria-valuetext", this._labelTextForIndex(this._levelIndex));
      }
    }
    if (name === "liang" || name === "liang-asset-base" || name === "liang-label") this._syncLiang();
    if (name === "chibi" || name === "chibi-sprite") this._syncChibi();
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._setValue(Number(nextValue), { animateLabel: true, reflect: true });
  }

  get level() {
    const level = this._levels[this._levelIndex];
    return level ? level.label : "";
  }

  get open() {
    return this.hasAttribute("open");
  }

  set open(nextOpen) {
    nextOpen ? this.openPanel() : this.close();
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(nextDisabled) {
    this.toggleAttribute("disabled", Boolean(nextDisabled));
  }

  get supported() {
    return this._supportedSet;
  }

  set supported(value) {
    if (value == null) {
      this.removeAttribute("supported");
      return;
    }
    this.setAttribute("supported", JSON.stringify(value));
  }

  get levels() {
    return this._levels;
  }

  set levels(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    this._levels = list.map((item, index) =>
      typeof item === "string"
        ? { label: item, id: void 0, canonical: void 0, rank: index }
        : {
            label: String(item.label ?? ""),
            id: item.id,
            canonical: item.canonical,
            rank: item.rank ?? index,
          },
    );
    this._syncLevels();
  }

  /** Default 状态：无属性表示当前不是默认档。 */
  get defaultActive() {
    return this.hasAttribute("default-active");
  }

  set defaultActive(next) {
    this.toggleAttribute("default-active", Boolean(next));
  }

  /** 滑动变祖器开关：无属性即关闭。 */
  get liang() {
    return this.hasAttribute("liang");
  }

  set liang(next) {
    this.toggleAttribute("liang", Boolean(next));
  }

  /** 大肥鱼 thumb 开关：无属性即关闭。 */
  get chibi() {
    return this.hasAttribute("chibi");
  }

  set chibi(next) {
    this.toggleAttribute("chibi", Boolean(next));
  }

  /** 当前档位对应的梁段名（如「梁祖」）。 */
  get liangStage() {
    return LIANG_STAGES[clamp(this._levelIndex, 0, LIANG_STAGES.length - 1)];
  }

  _syncLevels() {
    if (!this._ticksEl) return;
    this._ticksEl.textContent = "";
    this._ticks = [];
    for (let i = 0; i < this._levels.length; i += 1) {
      const tick = document.createElement("span");
      tick.className = "tick";
      this._ticksEl.appendChild(tick);
      this._ticks.push(tick);
    }
    this._input.max = String(this._levels.length - 1);
    this._supportedSet = new Set(this._levels.map((_, i) => i));
    this._syncTickStates();
    this._setValue(this._value, { animateLabel: false, reflect: false });
  }

  _syncTickStates() {
    const maxIndex = this._levels.findIndex((level) => level.canonical === "max");
    this.toggleAttribute("data-max-supported", maxIndex >= 0 && this._isSupported(maxIndex));
    for (let i = 0; i < this._ticks.length; i += 1) {
      const tick = this._ticks[i];
      tick.style.setProperty("--tick-frac", String(this._valueToDisplay(i)));
      tick.toggleAttribute("data-disabled", !this._isSupported(i));
    }
  }

  // Map a continuous value to a linear track fraction across the fixed levels.
  _valueToDisplay(value) {
    const n = this._levels.length;
    const idx = clamp(Number.isFinite(value) ? value : 0, 0, n - 1);
    if (n <= 1) return 0.5;
    return idx / (n - 1);
  }

  _parseSupported() {
    const raw = this.getAttribute("supported");
    const allIndices = this._levels.map((_, i) => i);
    let set = new Set(allIndices);
    if (raw) {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (Array.isArray(parsed) && parsed.length) {
        const booleanList =
          parsed.length === this._levels.length &&
          parsed.every((entry) => typeof entry === "boolean");
        const candidate = new Set();
        parsed.forEach((entry, index) => {
          if (booleanList) {
            if (entry) candidate.add(index);
          } else if (typeof entry === "number" && Number.isInteger(entry)) {
            candidate.add(entry);
          }
        });
        // 全 false 是合法状态：表示没有任何标准档位可用，不能回退成全支持。
        if (booleanList) set = candidate;
        else if (candidate.size) set = candidate;
      }
    }
    // 只有当 Default 状态激活时，index 0 才作为“Default/Off 中性位”保留。
    // 否则 index 0 就是普通 Off 档位，应该由 supported 数据决定是否可用。
    if (this._defaultActive) set.add(0);
    for (const index of Array.from(set)) {
      if (index < 0 || index >= this._levels.length || !Number.isInteger(index)) set.delete(index);
    }
    this._supportedSet = new Set([...set].sort((a, b) => a - b));
    if (this._ticks.length) {
      this._syncTickStates();
      // 同步 .on 状态，避免旧的点亮状态残留到新禁用档位上。
      this._updateTicks(Math.round(this._value));
    }
  }

  _isSupported(index) {
    return this._supportedSet ? this._supportedSet.has(index) : true;
  }

  _cancelTimer(key) {
    const handle = this[key];
    if (typeof handle === "function") {
      try {
        handle();
      } catch (err) {
        // ignore disposal errors
      }
    }
    this[key] = 0;
  }

  openPanel() {
    if (this.disabled) return;
    this._cancelTimer("_closeTimer");
    this.removeAttribute("data-closing");
    if (!this.open) this.setAttribute("open", "");
    this._panel.hidden = false;
    this._resizeCanvas();
    if (this.liang) {
      this._resizeLiangCanvas();
      this._preloadLiangFrame(this._liangFrame);
    }
  }

  close() {
    if (!this.open && !this.hasAttribute("data-closing")) return;
    this._cancelTimer("_closeTimer");
    this.setAttribute("data-closing", "");
    this.removeAttribute("open");
    this._closeTimer = effortTiming.timeout(() => {
      this._closeTimer = 0;
      this._panel.hidden = true;
      this.removeAttribute("data-closing");
      this._helpWrap.removeAttribute("data-tip-open");
    }, this._reducedMotion.matches ? 0 : 120);
  }

  toggle() {
    if (this.disabled) return;
    this.open ? this.close() : this.openPanel();
  }

  _syncOpenState() {
    const isOpen = this.open;
    const inline = this.hasAttribute("inline");
    if (!inline) {
      this._trigger.setAttribute("aria-expanded", String(isOpen));
      this._panel.inert = !isOpen;
    }
    if (isOpen) {
      this._panel.hidden = false;
      effortTiming.timeout(() => this._resizeCanvas(), 16);
    } else if (!inline && !this.hasAttribute("data-closing")) {
      this._panel.hidden = true;
    }
  }

  _syncInlineState() {
    const inline = this.hasAttribute("inline");
    if (!this._panel) return;
    if (inline) {
      this._panel.hidden = false;
      this._panel.inert = false;
      this.removeAttribute("data-closing");
      this._cancelTimer("_closeTimer");
      effortTiming.timeout(() => this._resizeCanvas(), 16);
    }
  }

  _syncDisabledState() {
    const isDisabled = this.disabled;
    this._input.disabled = isDisabled;
    this._trigger.disabled = isDisabled;
    this._helpButton.disabled = isDisabled;
    this._liangToggle.disabled = isDisabled;
  }

  _syncTexts() {
    if (!this._titlePrefix) return;
    this._titlePrefix.textContent = this.getAttribute("label") || "Effort";
    this._axisLow.textContent = this.getAttribute("axis-low") || "Faster";
    this._axisHigh.textContent = this.getAttribute("axis-high") || "Smarter";
    this._tooltipText.textContent = this.getAttribute("tooltip") ||
      "Higher effort spends more time reasoning. Max adds the deepest analysis and code pass.";
    this._input.setAttribute("aria-label", this.getAttribute("input-aria-label") || "Effort level");
    this._helpButton.setAttribute("aria-label", this.getAttribute("help-aria-label") || "About effort levels");
    this._panel.setAttribute("aria-label", this.getAttribute("label") || "Effort settings");
  }

  // ---------- 滑动变祖器（梁）feature ----------

  // 档位标签：Default 激活时 index 0 显示为 Default；梁开启时其他档位加段名后缀。
  _labelTextForIndex(index) {
    if (this._defaultActive && index === 0) return "Default";
    const level = this._levels[index];
    const base = level ? level.label : "";
    if (this.liang && index >= 0 && index < LIANG_STAGES.length) {
      return `${base} ${LIANG_STAGES[index]}`;
    }
    return base;
  }

  _applyLevelLabel() {
    const text = this._labelTextForIndex(this._levelIndex);
    if (this._levelStage) this._levelStage.dataset.current = text;
    if (this._currentLabel && this._currentLabel.textContent !== text) {
      this._currentLabel.textContent = text;
    }
    if (this._triggerValue && this._triggerValue.textContent !== text) {
      this._triggerValue.textContent = text;
    }
    if (this._trigger) {
      this._trigger.setAttribute("aria-label", `Effort level: ${text}`);
    }
  }

  _syncLiang() {
    if (!this._liangPortrait) return;
    const enabled = this.liang;
    this._liangAssetBase = this.getAttribute("liang-asset-base") || "/effort-slider-assets/liang-frames/";
    this._liangLabel = this.getAttribute("liang-label") || "滑动变祖器";
    this._liangToggleLabel.textContent = this._liangLabel;
    this._liangToggle.setAttribute("aria-label", this._liangLabel);
    this._liangPortrait.hidden = !enabled;
    // 梁开启时标签加段名后缀；关闭时回纯档位名
    this._applyLevelLabel();
    // 组件内嵌开关与外部属性同步 aria-checked
    this._liangToggle.setAttribute("aria-checked", String(enabled));
    if (enabled) {
      this._resizeLiangCanvas();
      this._preloadLiangRange();
      this._preloadLiangFrame(this._liangFrame);
      this._updateLiangAria(this._liangFrame);
    }
  }

  _liangFrameForValue(value) {
    // 六档各占 5 个帧位的连续映射（同 Liang 原版：段内 6 帧含段首）
    const v = clamp(Number.isFinite(value) ? value : 0, 0, this._levels.length - 1);
    const span = 30 / Math.max(1, this._levels.length - 1);
    return clamp(Math.round(v * span), 0, 30);
  }

  _resizeLiangCanvas() {
    const rect = this._liangPortrait.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (this._liangCanvas.width !== width || this._liangCanvas.height !== height) {
      this._liangCanvas.width = width;
      this._liangCanvas.height = height;
      this._liangCanvas.style.width = `${rect.width}px`;
      this._liangCanvas.style.height = `${rect.height}px`;
      this._drawLiangFrame(this._liangFrame);
    }
  }

  _liangFrameUrl(frame) {
    return `${this._liangAssetBase}frame-${String(frame).padStart(2, "0")}.webp`;
  }

  _liangCacheKey(frame) {
    return `${this._liangAssetBase}|${frame}`;
  }

  _drawLiangFrame(frame) {
    const context = this._liangCanvas.getContext("2d");
    if (!context || !this._liangCanvas.width) return;
    const image = this._liangImages.get(this._liangCacheKey(frame));
    if (!image) return;
    context.clearRect(0, 0, this._liangCanvas.width, this._liangCanvas.height);
    context.drawImage(image, 0, 0, this._liangCanvas.width, this._liangCanvas.height);
  }

  _updateLiangAria(frame) {
    // 与 _liangFrameForValue 的 6 帧一段保持一致：0-5 第一段，6-11 第二段……
    const stageIndex = clamp(Math.floor(frame / 6), 0, LIANG_STAGES.length - 1);
    this._liangCanvas.setAttribute("aria-label", `梁系强度：${LIANG_STAGES[stageIndex]}`);
  }

  _preloadLiangFrame(frame) {
    const key = this._liangCacheKey(frame);
    if (this._liangImages.has(key)) {
      const cached = this._liangImages.get(key);
      if (cached.complete && frame === this._liangFrame) this._drawLiangFrame(frame);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (frame === this._liangFrame) this._drawLiangFrame(frame);
    };
    image.src = this._liangFrameUrl(frame);
    this._liangImages.set(key, image);
  }

  _preloadLiangRange() {
    for (let frame = 0; frame <= LIANG_MAX_FRAME; frame += 1) {
      this._preloadLiangFrame(frame);
    }
  }

  // ---------- 大肥鱼 thumb feature ----------

  _syncChibi() {
    const enabled = this.chibi;
    if (this.getAttribute("chibi-sprite")) {
      this._chibiSprite = this.getAttribute("chibi-sprite");
    }
    this.style.setProperty("--chibi-sprite", `url("${this._chibiSprite}")`);
    this.toggleAttribute("chibi", enabled);
    // 帧循环（静止 720ms / 拖拽 420ms / reduced-motion 冻结）全部由
    // CSS keyframes + [data-dragging] 属性驱动，无需 JS 定时器。
  }

  _onDocumentPointerDown(event) {
    if (this.open && !this.hasAttribute("inline") && !event.composedPath().includes(this)) this.close();
  }

  _onPointerDown(event) {
    if (this.disabled) return;
    this._dragging = true;
    this.setAttribute("data-dragging", "");
    if (event && typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (err) {
        // 某些浏览器/环境下可能已经释放，忽略即可
      }
    }
  }

  _onPointerUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this.removeAttribute("data-dragging");
    this._snapToNearest();
  }

  _onInput() {
    let nextValue = Number.parseFloat(this._input.value);
    if (this._dragging) {
      nextValue = this._applyMagnet(nextValue);
      this._input.value = String(nextValue);
    }
    this._setValue(nextValue, { animateLabel: true, reflect: false });
    this._emit("input");
  }

  _applyMagnet(value) {
    const magnetTargets = this._magnetTargets();
    if (!magnetTargets.length) return value;
    let nearest = magnetTargets[0];
    let bestDelta = Math.abs(value - nearest);
    for (const index of magnetTargets) {
      const delta = Math.abs(value - index);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = index;
      }
    }
    const delta = value - nearest;
    const distance = Math.abs(delta);
    const radius = 0.5;
    if (distance < 0.001 || distance > radius) return value;
    const t = 1 - distance / radius;
    const strength = 0.68 + 0.42 * t;
    return value - delta * strength * t * t;
  }

  _magnetTargets() {
    return this._levels.map((_, i) => i);
  }

  _onKeyDown(event) {
    if (this.disabled) return;
    const keyTargets = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      Home: 0,
      End: this._levels.length - 1,
      PageDown: -1,
      PageUp: 1,
    };
    if (!(event.key in keyTargets)) return;
    event.preventDefault();
    let target;
    if (event.key === "Home") {
      target = 0;
    } else if (event.key === "End") {
      target = this._levels.length - 1;
    } else {
      target = clamp(Math.round(this._value) + keyTargets[event.key], 0, this._levels.length - 1);
    }
    this._setValue(target, { animateLabel: false, reflect: true });
    this._emit("input");
    this._emit("change");
  }

  _snapToNearest() {
    const target = Math.round(this._value);
    this._setValue(target, { animateLabel: false, reflect: true });
    this._emit("change");
  }

  _levelColorAt(value) {
    const v = clamp(Number.isFinite(value) ? value : 0, 0, this._levels.length - 1);
    const i = Math.floor(v);
    const t = smoothstep(0, 1, v - i);
    const n = Math.min(i + 1, this._levels.length - 1);
    return {
      base: interpColor(LEVEL_COLORS[i], LEVEL_COLORS[n], t),
      soft: interpColor(LEVEL_COLORS_SOFT[i], LEVEL_COLORS_SOFT[n], t),
      deep: interpColor(LEVEL_COLORS_DEEP[i], LEVEL_COLORS_DEEP[n], t),
    };
  }

  _updateTicks(activeIndex) {
    if (!this._ticks) return;
    this._ticks.forEach((tick, i) => {
      tick.classList.toggle("on", i <= activeIndex && this._isSupported(i));
    });
  }

  _updateTriggerBars(activeIndex) {
    if (!this._bars) return;
    this._bars.forEach((bar, i) => bar.classList.toggle("on", i <= activeIndex));
  }

  _setValue(nextValue, { animateLabel = true, reflect = false } = {}) {
    const safeValue = clamp(Number.isFinite(nextValue) ? nextValue : 0, 0, this._levels.length - 1);
    const nextIndex = clamp(Math.round(safeValue), 0, this._levels.length - 1);
    const previousIndex = this._levelIndex;
    const level = this._levels[nextIndex];
    this._value = safeValue;
    this._input.value = String(safeValue);
    this._input.setAttribute("aria-valuetext", this._labelTextForIndex(nextIndex));
    this.style.setProperty(
      "--ds-effort-progress",
      String(this._valueToDisplay(safeValue)),
    );
    this.style.setProperty("--fill-x", `${(this._valueToDisplay(safeValue) * 100).toFixed(1)}%`);

    const color = this._levelColorAt(safeValue);
    this.style.setProperty("--ds-effort-level-color", rgb(color.base));
    this.style.setProperty("--ds-effort-level-soft", rgb(color.soft));
    this.style.setProperty("--ds-effort-level-deep", rgb(color.deep));
    this.setAttribute("data-level", String(nextIndex));
    this.toggleAttribute("data-glow", nextIndex >= 3);

    // 梁：拖动时逐帧换人像（连续值 → 帧号），松手吸附后停在段首帧
    if (this.liang) {
      const frame = this._liangFrameForValue(safeValue);
      if (frame !== this._liangFrame) {
        this._liangFrame = frame;
        this._preloadLiangFrame(frame);
        this._updateLiangAria(frame);
      }
    }

    if (nextIndex !== previousIndex) {
      this._levelIndex = nextIndex;
      this._swapLabel(this._labelTextForIndex(nextIndex), nextIndex > previousIndex, animateLabel);
    } else if (this._currentLabel.textContent !== this._labelTextForIndex(nextIndex)) {
      this._currentLabel.textContent = this._labelTextForIndex(nextIndex);
    }

    this._updateTicks(nextIndex);
    this._updateTriggerBars(nextIndex);

    const labelText = this._labelTextForIndex(nextIndex);
    if (this._levelStage) this._levelStage.dataset.current = labelText;
    this._triggerValue.textContent = labelText;
    this._trigger.setAttribute("aria-label", `Effort level: ${labelText}`);
    const isMax = Boolean(level && level.canonical === "max");
    this._setMax(isMax);
    // High/Extra 时启动"点阵 + 水波纹"场（Max 的弱化前奏）；离开则停止
    const mode = isMax ? "max" : nextIndex === 3 || nextIndex === 4 ? String(nextIndex) : null;
    if (mode !== this._fieldMode) {
      this._fieldMode = mode;
      this._rippleStart = Date.now();
      this.toggleAttribute("data-field", mode === "3" || mode === "4");
      if (mode && mode !== "max") {
        this._ensureCanvasLoop();
      } else if (!mode) {
        this._cancelTimer("_canvasFrame");
        this._drawPixelField(Date.now());
      }
    }

    if (reflect) {
      this._reflectingValue = true;
      this.setAttribute("value", String(Number(safeValue.toFixed(3))));
      this._reflectingValue = false;
    }
  }

  _swapLabel(nextLabel, forward, animate) {
    this._cancelTimer("_labelFrame");
    this._cancelTimer("_labelTimer");
    const shouldAnimate = animate && !this._reducedMotion.matches && this.isConnected;
    const previousLabel = this._currentLabel.textContent;
    this._currentLabel.classList.remove("is-preparing");
    this._outgoingLabel.classList.remove("is-exiting");

    if (!shouldAnimate) {
      this._outgoingLabel.textContent = "";
      this._currentLabel.textContent = nextLabel;
      return;
    }

    this._outgoingLabel.textContent = previousLabel;
    this._currentLabel.textContent = nextLabel;
    const enterY = forward ? "3px" : "-3px";
    const exitY = forward ? "-3px" : "3px";
    this._currentLabel.style.setProperty("--label-enter-y", enterY);
    this._outgoingLabel.style.setProperty("--label-exit-y", exitY);
    this._currentLabel.classList.add("is-preparing");

        this._currentLabel.getBoundingClientRect();

    this._labelFrame = effortTiming.timeout(() => {
      this._labelFrame = 0;
      this._currentLabel.classList.remove("is-preparing");
      this._outgoingLabel.classList.add("is-exiting");
    }, 16);

    this._labelTimer = effortTiming.timeout(() => {
      this._outgoingLabel.textContent = "";
      this._outgoingLabel.classList.remove("is-exiting");
    }, 320);
  }

  _setMax(isMax) {
    if (isMax === this._isMax) return;
    this._isMax = isMax;
    this.toggleAttribute("data-max", isMax);
    if (isMax) {
      this.setAttribute("data-pixels-ready", "");
      this._reveal = this._reducedMotion.matches ? 1 : 0;
      this._maxStartedAt = Date.now();
      this._ensureCanvasLoop();
    } else {
      this._cancelTimer("_canvasFrame");
      this.removeAttribute("data-pixels-ready");
      this._reveal = 0;
      this._drawPixelField(Date.now());
    }
  }

  _onReducedMotionChange() {
    if (this._isMax) {
      this.setAttribute("data-pixels-ready", "");
      this._reveal = this._reducedMotion.matches ? 1 : 0;
      this._maxStartedAt = Date.now();
      this._ensureCanvasLoop();
    } else if (this._fieldMode === "3" || this._fieldMode === "4") {
      if (this._reducedMotion.matches) {
        this._cancelTimer("_canvasFrame");
        this._drawPixelField(Date.now());
      } else {
        this._ensureCanvasLoop();
      }
    }
  }

  _resizeCanvas() {
    const rect = this._track.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (this._canvas.width !== width || this._canvas.height !== height) {
      this._canvas.width = width;
      this._canvas.height = height;
      this._canvas.style.width = `${rect.width}px`;
      this._canvas.style.height = `${rect.height}px`;
      this._buildPixelGrid();
      this._drawPixelField(Date.now());
    }
  }

  // Precompute every static per-cell value (position, hashes, field gradients)
  // once per resize, so each frame only does time-dependent math.
  _buildPixelGrid() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = this._canvas.width / ratio;
    const height = this._canvas.height / ratio;
    const cell = width < 280 ? 5 : 6;
    const gap = 1.1;
    const columns = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cell;
        const y = row * cell;
        const nX = (x + cell * 0.5) / width;
        cells.push({
          x,
          y,
          row,
          column,
          nX,
          base: Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1,
          tempo: Math.abs(Math.sin(column * 7.13 + row * 19.41) * 19341.731) % 1,
          phase: Math.abs(Math.sin(column * 31.17 + row * 11.93) * 28437.123) % 1,
          chroma: Math.abs(Math.sin(column * 9.47 + row * 67.13) * 15823.917) % 1,
          purple: smoothstep(0.1, 0.88, nX),
          intensity: smoothstep(0.04, 0.38, nX),
          depth: smoothstep(0.35, 0.95, nX),
        });
      }
    }
    this._pixelGrid = cells;
    this._pixelCell = cell;
    this._pixelGap = gap;
    this._pixelRows = rows;
  }

  _ensureCanvasLoop() {
    if (this._canvasFrame) return;
    if (this._reducedMotion.matches) {
      this._drawPixelField(Date.now());
      return;
    }
    const frame = () => {
      const time = Date.now();
      if (!this.isConnected || !this._fieldMode || this._reducedMotion.matches) {
        this._cancelTimer("_canvasFrame");
        return;
      }
      if (time - this._lastCanvasFrame >= 33) {
        this._lastCanvasFrame = time;
        if (this._isMax) this._reveal = smoothstep(0, 1, (time - this._maxStartedAt) / 1000);
        this._drawPixelField(time);
      }
    };
    this._canvasFrame = effortTiming.raf(frame);
  }

  _drawPixelField(time) {
    const context = this._canvas.getContext("2d");
    if (!context || !this._canvas.width || !this._canvas.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = this._canvas.width / ratio;
    const height = this._canvas.height / ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (this._fieldMode === "3" || this._fieldMode === "4") {
      this._drawRippleField(context, width, height, time, this._fieldMode);
      return;
    }
    if (!this._isMax) return;

    const reveal = this._reducedMotion.matches ? 1 : this._reveal;
    const frontier = 1 - reveal;
    const cells = this._pixelGrid || [];
    const cell = this._pixelCell || (width < 280 ? 5 : 6);
    const gap = this._pixelGap ?? 1.1;
    const elapsed = Math.max(0, time - this._maxStartedAt);

    // Max track palette (share-weighted).
    const leftColor = [210, 206, 214];
    const deepViolet = [150, 96, 205];
    const deepMid = [156, 118, 200];
    const midPurple = [166, 140, 206];
    const softMid = [170, 154, 206];
    const softLilac = [182, 168, 206];
    const paleCool = [194, 182, 206];
    const highlightColor = [196, 182, 222];
    const peakColor = [212, 198, 234];
    const tones = [
      deepViolet, deepViolet, deepMid, deepMid,
      midPurple, midPurple, midPurple,
      softMid, softMid, softLilac, paleCool,
    ];

    const flowDuration = 4000;
    const rawFlow = elapsed / flowDuration;
    const flowCycle = Math.floor(rawFlow);
    const easedFlow = flowCycle + smoothstep(0, 1, rawFlow - flowCycle);

    context.save();
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(0, 0, width, height, 10);
    } else {
      context.rect(0, 0, width, height);
    }
    context.clip();

    for (const c of cells) {
      const { x, y, row, nX, base, tempo, phase, chroma, purple, intensity, depth } = c;
      const revealAlpha = smoothstep(frontier - 0.1, frontier + 0.07, nX);
      if (revealAlpha <= 0.002) continue;

      const period = 500 + tempo * 1500;
      const localTime = elapsed + phase * period;
      const cycle = Math.floor(localTime / period);
      const cycleProgress = (localTime % period) / period;
      const cycleHash = Math.abs(
        Math.sin(c.column * 17.17 + row * 41.73 + cycle * 13.11) * 24634.6345,
      ) % 1;
      const widthHash = Math.abs(
        Math.sin(c.column * 5.37 + row * 29.11 + cycle * 7.43) * 17391.443,
      ) % 1;

      const pulseCenter = 0.2 + cycleHash * 0.55;
      const pulseWidth = 0.09 + widthHash * 0.08;
      const pulseDistance = (cycleProgress - pulseCenter) / pulseWidth;
      const pulseEnvelope = Math.exp(-pulseDistance * pulseDistance * 1.45);
      const activeCycle = cycleHash > 0.12 ? 1 : 0.26;
      const irregularFlicker = pulseEnvelope * activeCycle;

      const flowCoordinate = (nX + easedFlow) * 9;
      const flowIndex = Math.floor(flowCoordinate);
      const flowProgress = smoothstep(0, 1, flowCoordinate - flowIndex);
      const flowHashA = Math.abs(
        Math.sin(flowIndex * 18.31 + row * 37.17) * 19283.173,
      ) % 1;
      const flowHashB = Math.abs(
        Math.sin((flowIndex + 1) * 18.31 + row * 37.17) * 19283.173,
      ) % 1;
      const clusterGate = smoothstep(0.46, 0.84, mix(flowHashA, flowHashB, flowProgress));
      const wavePhase = (nX + easedFlow + row * 0.06 + base * 0.02) * Math.PI * 2;
      const directionalWave = Math.pow(0.5 + 0.5 * Math.cos(wavePhase), 5);
      const directionalFlow = Math.max(clusterGate, directionalWave * 0.62);
      const flowingFlicker = Math.max(
        irregularFlicker * (0.48 + directionalFlow * 0.58),
        directionalFlow * (0.38 + base * 0.28),
      );

      let lightAmount = flowingFlicker;
      const revealGlow = reveal < 0.995
        ? Math.exp(-((nX - frontier) ** 2) / 0.012) * (1 - smoothstep(0.7, 1, reveal))
        : 0;
      lightAmount = Math.max(lightAmount, revealGlow * (0.4 + base * 0.4));

      const peakHighlight =
        lightAmount > 0.4
        && irregularFlicker > 0.16
        && cycleHash > 0.26
        && clusterGate > 0.04;
      const hottestHighlight =
        lightAmount > 0.68
        && irregularFlicker > 0.3
        && cycleHash > 0.48
        && clusterGate > 0.12;
      const highlightAmount = peakHighlight
        ? 0.97
        : clamp(lightAmount * (0.44 + cycleHash * 0.3), 0, 0.64);

      const toneDrift =
        base * 0.28
        + depth * 0.28
        + cycleProgress * 0.38
        + easedFlow * 0.18
        + cycleHash * 0.2
        + Math.sin(elapsed * 0.00135 + phase * Math.PI * 2) * 0.14;
      const tonePosition = (((toneDrift % 1) + 1) % 1) * tones.length;
      const toneIndex = Math.floor(tonePosition);
      const toneMix = tonePosition - toneIndex;
      const toneA = tones[toneIndex];
      const toneB = tones[(toneIndex + 1) % tones.length];
      const cellTone = [
        mix(toneA[0], toneB[0], toneMix),
        mix(toneA[1], toneB[1], toneMix),
        mix(toneA[2], toneB[2], toneMix),
      ];

      const chromaNudge = (chroma - 0.5) * 10 + depth * 12;
      const variedPurple = [
        clamp(cellTone[0] + chromaNudge * 0.35 - depth * 8, 140, 196),
        clamp(cellTone[1] - depth * 16 + (base - 0.5) * 8, 104, 168),
        clamp(cellTone[2] + depth * 6 + (cycleHash - 0.5) * 6, 182, 216),
      ];
      const baseColor = [
        mix(leftColor[0], variedPurple[0], purple),
        mix(leftColor[1], variedPurple[1], purple),
        mix(leftColor[2], variedPurple[2], purple),
      ];
      const color = hottestHighlight
        ? mixColor(baseColor, peakColor, 0.95)
        : mixColor(baseColor, highlightColor, highlightAmount);

      const baseOpacity = 0.7 + base * 0.2;
      context.globalAlpha = peakHighlight || hottestHighlight
        ? revealAlpha * intensity
        : revealAlpha * intensity * clamp(baseOpacity + flowingFlicker * 0.12, 0, 1);
      context.fillStyle = color;
      context.fillRect(x + gap * 0.5, y + gap * 0.5, cell - gap, cell - gap);
    }

    context.restore();
    context.globalAlpha = 1;
  }

  // High(3)/Extra(4) 的粒子场：靠近 thumb 密集明亮，远处渐暗，
  // 明暗水波纹对比明显。
  _drawRippleField(context, width, height, time, mode) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = this._canvas.width / ratio;
    const heightCss = this._canvas.height / ratio;
    const thumbX =
      ((canvasWidth - this._thumb.offsetWidth) * this._valueToDisplay(this._value)) +
      this._thumb.offsetWidth * 0.5;
    const originX = clamp(thumbX, 4, canvasWidth - 4);

    // 蓝(High) / 紫(Extra) —— 区分于 Max 的深紫像素场
    const blue = mode === "3" ? [130, 172, 255] : [176, 140, 250];
    const elapsed = Math.max(0, time - (this._rippleStart || 0));

    const cells = this._pixelGrid || [];
    const cell = this._pixelCell || (canvasWidth < 280 ? 5 : 6);
    const gap = this._pixelGap ?? 1.1;

    // 展开动画：从 thumb 向两侧扩散（0→1，900ms）
    const reveal = this._reducedMotion.matches ? 1 : smoothstep(0, 1, elapsed / 900);

    // 明暗水波纹：3 条亮带从中心向外传播，对比更强
    const WAVE = 3;
    const ripplePeriod = 1400;
    const ripplePhase = (elapsed % ripplePeriod) / ripplePeriod;

    context.save();
    context.beginPath();
    if (typeof context.roundRect === "function") context.roundRect(0, 0, canvasWidth, heightCss, 10);
    else context.rect(0, 0, canvasWidth, heightCss);
    context.clip();

    for (const c of cells) {
      const { x, y, base, tempo, phase } = c;
      const dx = Math.abs(x - originX) / (canvasWidth * 0.5);
      if (dx > 1) continue;
      const near = clamp(1 - dx * 1.1, 0, 1); // 近 thumb 更密更亮
      // 密度：近处几乎全部保留，远处跳过大部分
      if (base > 0.6 - near * 0.5) continue;

      // 随机闪烁：每颗粒子亮度随时间独立起伏
      const flicker = 0.5 + 0.5 * Math.sin(elapsed * 0.015 + tempo * Math.PI * 2 + phase * 6.28);

      // 水波纹：3 条亮带，对比更强烈
      const wave = 0.5 + 0.5 * Math.sin((dx * WAVE - ripplePhase) * Math.PI * 2);

      // 展开：越靠近 thumb 越早亮，向外逐渐显现
      const revealAlpha = smoothstep(0, 1, reveal * (1 - dx * 0.85) + dx * 0.15);

      // 亮度：近处大幅提高，远处压低；水波纹增强对比
      const brightness = (0.15 + 0.45 * flicker + near * (0.5 + near * 0.3)) * (0.12 + 0.88 * wave) * revealAlpha;
      const alpha = clamp(brightness, 0, 1);
      context.fillStyle = `rgba(${blue[0]}, ${blue[1]}, ${blue[2]}, ${alpha.toFixed(3)})`;
      context.fillRect(x + gap * 0.5, y + gap * 0.5, cell - gap, cell - gap);
    }

    context.restore();
    context.globalAlpha = 1;
  }

  _emit(type) {
    this.dispatchEvent(
      new CustomEvent(type, {
        bubbles: true,
        composed: true,
        detail: {
          index: this._levelIndex,
          level: this._levels[this._levelIndex] ? this._levels[this._levelIndex].label : "",
          value: this._value,
        },
      }),
    );
  }
}

if (!customElements.get("ds-effort-slider")) {
  customElements.define("ds-effort-slider", DsEffortSlider);
}


// =============================================================================
// ds-effort-slider — client plugin logic (React wrapper + forked ModelSelect)
// This file is a FRAGMENT. scripts/build-client.mjs prepends the Web Component
// source from src/ds-effort-slider.js into the same function scope, providing
// LEVELS, the color/math helpers, the effortTiming adapter and the element.
// Edit the component ONLY in src/ds-effort-slider.js; never paste a copy here.
// The demo/ page loads that component source directly.
// =============================================================================

// Canonical level tokens, ordered left to right. "default" is a special
// provider-default state that submits without reasoningEffort when possible;
// "off" is a real first level.
const CANONICAL_ORDER = ["off", "low", "medium", "high", "extra", "max"];

// Explicit alias sets. These are checked BEFORE generic substring matching so
// compound names like "Extra High" / "X-High" are not swallowed by "high".
const DEFAULT_ALIASES = new Set(["default", "auto", "automatic"]);
const OFF_ALIASES = new Set([
  "off", "none", "disabled", "no",
  "no reasoning", "no-reasoning", "no_reasoning",
  "no effort", "no_effort",
]);
const LOW_ALIASES = new Set(["low", "lite", "light", "minimal"]);
const MEDIUM_ALIASES = new Set(["medium", "med", "mid", "balanced", "normal", "standard"]);
const HIGH_ALIASES = new Set(["high", "strong", "hard"]);
const EXTRA_ALIASES = new Set([
  "extra", "extreme",
  "xhigh", "x-high", "x high",
  "extra high", "extra-high", "extra_high",
  "extreme high", "very high", "ultra high", "super high", "high+",
]);
const MAX_ALIASES = new Set(["max", "maximum", "ultracode"]);

function normalizeName(name) {
  return String(name == null ? "" : name)
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ")
    .replace(/[()\[\]{}.,:;!?*"]/g, "");
}

// Map a provider effort display name to a canonical token. "default" means
// the provider-default state; unknown names return undefined so they can be
// appended as adapter-specific extras.
function canonicalToken(name) {
  const n = normalizeName(name);
  if (!n) return void 0;
  if (DEFAULT_ALIASES.has(n)) return "default";
  if (OFF_ALIASES.has(n)) return "off";
  if (LOW_ALIASES.has(n)) return "low";
  if (MEDIUM_ALIASES.has(n)) return "medium";
  if (HIGH_ALIASES.has(n)) return "high";
  if (EXTRA_ALIASES.has(n)) return "extra";
  if (MAX_ALIASES.has(n)) return "max";
  for (const token of CANONICAL_ORDER) {
    if (n === token) return token;
    if (n.includes(` ${token}`) || n.includes(`${token} `)) return token;
  }
  return void 0;
}

function effortNameForId(reasoning, id) {
  if (!reasoning || !Array.isArray(reasoning.efforts)) return void 0;
  const eff = reasoning.efforts.find((e) => e.id === id);
  return eff ? eff.name : void 0;
}

// Fixed slider positions: Off is the leftmost real level; Default and any
// adapter-specific strengths are offered below the slider.
function computeSupported(reasoning) {
  const supported = LEVELS.map(() => false);
  if (reasoning && Array.isArray(reasoning.efforts)) {
    for (const eff of reasoning.efforts) {
      const idx = LEVELS.findIndex((level) => level.canonical === canonicalToken(eff.name));
      if (idx >= 0) supported[idx] = true;
    }
  }
  return supported;
}

// Nearest supported position at or below `from`; -1 when none exists.
function nearestSupportedBelow(supported, from) {
  for (let i = Math.min(from, supported.length - 1); i >= 0; i -= 1) {
    if (supported[i]) return i;
  }
  return -1;
}

// Prefer the effort whose normalized name exactly matches the canonical token,
// so "Extra" beats "X-High" when both map to extra. Falls back to the first
// candidate when no exact match exists.
function preferredEffortId(reasoning, canonical) {
  if (!reasoning || !Array.isArray(reasoning.efforts)) return void 0;
  const candidates = reasoning.efforts.filter((e) => canonicalToken(e.name) === canonical);
  if (candidates.length === 0) return void 0;
  const exact = candidates.find((e) => normalizeName(e.name) === canonical);
  if (exact) return exact.id;
  const level = LEVELS.find((l) => l.canonical === canonical);
  if (level) {
    const labelExact = candidates.find((e) => normalizeName(e.name) === normalizeName(level.label));
    if (labelExact) return labelExact.id;
  }
  return candidates[0].id;
}

function effortIdForCanonical(reasoning, canonical) {
  return preferredEffortId(reasoning, canonical);
}

// --- feature preference stores (localStorage-backed) -------------------------
// 滑动变祖器（梁）与大肥鱼 thumb 的开关状态。组件内嵌的 liang 开关走
// liangStore，设置页的 chibi 开关走 chibiStore；两处均持久化到当前浏览器。
function readPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function makePrefStore(key, fallback) {
  let current = readPref(key, fallback);
  const listeners = new Set();
  const store = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next, persist = true) => {
      if (current === next) return;
      current = next;
      if (persist) {
        try {
          window.localStorage.setItem(key, String(next));
        } catch {
          // 当前页面仍然跟随选择；仅持久化失败
        }
      }
      listeners.forEach((listener) => listener());
    },
  };
  return store;
}

const LIANG_STORAGE_KEY = "dsh-client-ui-effort-slider.liang";
const CHIBI_STORAGE_KEY = "dsh-client-ui-effort-slider.chibi";
const liangStore = makePrefStore(LIANG_STORAGE_KEY, false);
const chibiStore = makePrefStore(CHIBI_STORAGE_KEY, false);

// --- React wrapper around <ds-effort-slider> -------------------------------
// React renders the custom element; all non-string interactions happen through
// a ref + effect so we never fight React's attribute serialization.
function EffortSlider(props) {
  const {
    supported, value, disabled, defaultActive,
    onChange, labels, liang, chibi, onLiangChange,
  } = props;
  const ref = React.useRef(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const onLiangChangeRef = React.useRef(onLiangChange);
  onLiangChangeRef.current = onLiangChange;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.supported = supported;
  }, [supported]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value;
  }, [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.defaultActive = Boolean(defaultActive);
  }, [defaultActive]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.liang = Boolean(liang);
  }, [liang]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.chibi = Boolean(chibi);
  }, [chibi]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 组件内嵌的梁开关被点击后向上同步状态
    const onLiangToggle = () => {
      onLiangChangeRef.current?.(el.liang);
    };
    el.addEventListener("ds-liang-toggle", onLiangToggle);
    return () => el.removeEventListener("ds-liang-toggle", onLiangToggle);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChg = (event) => {
      const index = event.detail && typeof event.detail.index === "number"
        ? event.detail.index
        : (el._levelIndex != null ? el._levelIndex : 0);
      onChangeRef.current(index);
    };
    el.addEventListener("change", onChg);
    return () => el.removeEventListener("change", onChg);
  }, []);

  return React.createElement("ds-effort-slider", {
    ref,
    disabled: disabled ? true : void 0,
    "default-active": defaultActive ? true : void 0,
    inline: true,
    label: labels && labels.label,
    "axis-low": labels && labels.axisLow,
    "axis-high": labels && labels.axisHigh,
    tooltip: labels && labels.tooltip,
    "input-aria-label": labels && labels.inputAria,
    "help-aria-label": labels && labels.helpAria,
    "liang-label": labels && labels.liangToggle,
  });
}

// --- Forked ModelSelect ------------------------------------------------------
function EffortModelSelect(props) {
  const { locked, available, directory, load, select, t } = props;

  const [snapshot, setSnapshot] = React.useState(() => directory.getSnapshot());
  React.useEffect(() => {
    let unsub = () => {};
    try {
      unsub = directory.subscribe(() => setSnapshot(directory.getSnapshot()));
      setSnapshot(directory.getSnapshot());
    } catch (err) {
      // snapshot store may be unavailable; keep the initial value
    }
    return unsub;
  }, [directory]);

  const state = snapshot;
  const [open, setOpen] = React.useState(false);
  const [pane, setPane] = React.useState("root");
  const lastActionRef = React.useRef("load");
  const [toast, setToast] = React.useState(null);
  const toastSeq = React.useRef(0);
  const [chosenIndex, setChosenIndex] = React.useState(null);
  const [defaultChosen, setDefaultChosen] = React.useState(false);
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const [liang, setLiang] = React.useState(() => liangStore.getSnapshot());
  const [chibi, setChibi] = React.useState(() => chibiStore.getSnapshot());

  React.useEffect(() => {
    const unsubLiang = liangStore.subscribe(() => setLiang(liangStore.getSnapshot()));
    const unsubChibi = chibiStore.subscribe(() => setChibi(chibiStore.getSnapshot()));
    return () => {
      unsubLiang();
      unsubChibi();
    };
  }, []);

  const choices = React.useMemo(() => {
    if (!state || !Array.isArray(state.groups)) return [];
    return state.groups.flatMap((group) =>
      group.models.map((model) => ({
        group,
        model,
        selection: {
          provider: group.id,
          model: model.id,
          ...(model.reasoning && model.reasoning.defaultEffort !== void 0
            ? { reasoningEffort: model.reasoning.defaultEffort }
            : {}),
        },
      })),
    );
  }, [state]);

  const current = state ? state.current : null;
  const currentChoice = current == null
    ? void 0
    : choices.find((c) => c.selection.provider === current.provider && c.selection.model === current.model);
  const reasoning = currentChoice ? currentChoice.model.reasoning : void 0;

  const effectiveEffort = current ? (current.reasoningEffort ?? (reasoning ? reasoning.defaultEffort : void 0)) : void 0;
  const hasExplicitEffort = Boolean(current && current.reasoningEffort !== void 0);

  const supported = React.useMemo(() => computeSupported(reasoning), [reasoning]);

  // The level that is actually applied. When the user has not set an explicit
  // reasoningEffort, we show the provider-default state as "Default" rather
  // than pretending the provider's default effort is an explicit slider pick.
  // Models without reasoning metadata still get this Default surface: DSH only
  // omits `reasoning` when the adapter cannot offer selectable efforts, so the
  // only honest control is "use the provider default / no explicit effort".
  const appliedLevel = React.useMemo(() => {
    if (!currentChoice) return void 0;
    if (reasoning === void 0) {
      if (!hasExplicitEffort || defaultChosen) {
        return { label: t("effort.providerDefault"), canonical: "default" };
      }
      const effId = current && current.reasoningEffort;
      return { label: effId || t("effort.providerDefault"), canonical: void 0 };
    }
    if (!hasExplicitEffort || defaultChosen) {
      return { label: t("effort.providerDefault"), canonical: "default" };
    }
    const effId = current && current.reasoningEffort;
    const name = effortNameForId(reasoning, effId);
    return { label: name || effId, canonical: canonicalToken(name) };
  }, [reasoning, current, currentChoice, defaultChosen, hasExplicitEffort, t]);

  const isDefaultActive = !hasExplicitEffort || defaultChosen;

  // Where the thumb should rest when the user has not clicked a slider slot.
  const derivedIndex = React.useMemo(() => {
    const applied = appliedLevel;
    if (applied && applied.canonical && applied.canonical !== "default") {
      const idx = LEVELS.findIndex((level) => level.canonical === applied.canonical);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [appliedLevel]);

  const sliderIndex = chosenIndex !== null ? chosenIndex : derivedIndex;
  const appliedIndex = React.useMemo(() => {
    if (appliedLevel && appliedLevel.canonical && appliedLevel.canonical !== "default") {
      const idx = LEVELS.findIndex((level) => level.canonical === appliedLevel.canonical);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  }, [appliedLevel]);
  // 信号条反映“实际生效档位”，而不是用户点击后停留的 thumb 位置。
  const activeBars = Math.round(appliedIndex);

  const effortLabel = appliedLevel ? appliedLevel.label : void 0;

  // 梁开启时：档位名后加段名（如「Max 梁祖」）。段名与组件内 LIANG_STAGES
  // 同源（构建时同作用域拼接）。
  const liangSuffix = liang && appliedLevel && appliedLevel.canonical && appliedLevel.canonical !== "default"
    ? (() => {
        const idx = LEVELS.findIndex((level) => level.canonical === appliedLevel.canonical);
        return idx >= 0 && idx < LIANG_STAGES.length ? LIANG_STAGES[idx] : void 0;
      })()
    : void 0;
  const displayEffortLabel = effortLabel === void 0 || liangSuffix === void 0
    ? effortLabel
    : `${effortLabel} ${liangSuffix}`;

  // Adapter-specific strengths that do not map to a slider level. Default-like
  // provider efforts ("Default" / "Auto") are also exposed as pills so the
  // provider's real default id can be selected explicitly.
  const extraEfforts = React.useMemo(() => {
    if (!reasoning || !Array.isArray(reasoning.efforts)) return [];
    return reasoning.efforts.filter((eff) => {
      const token = canonicalToken(eff.name);
      if (token === void 0 || token === "default") return true;
      return eff.id !== preferredEffortId(reasoning, token);
    });
  }, [reasoning]);

  const busy = state ? state.status === "selecting" : false;

  const reload = () => {
    lastActionRef.current = "load";
    load();
  };

  React.useEffect(() => {
    if (available) {
      lastActionRef.current = "load";
      load();
    }
  }, [available, load]);

  React.useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!rootRef.current || !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  // Auto-dismiss the toast after its countdown finishes. A new toast resets it.
  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!available) return null;

  const show = () => {
    setPane("root");
    setOpen(true);
    reload();
  };

  const close = (restoreFocus) => {
    setOpen(false);
    setPane("root");
    if (restoreFocus) {
      effortTiming.timeout(() => {
        if (triggerRef.current) triggerRef.current.focus();
      }, 0);
    }
  };

  const settleSelection = (accepted) => {
    if (accepted) {
      if (rootRef.current !== null) close(true);
      return;
    }
    const message = directory.getSnapshot().error;
    if (message !== null) {
      toastSeq.current += 1;
      setToast({ seq: toastSeq.current, text: t("error.action", { message }) });
    }
  };

  const settleEffortSelection = (accepted) => {
    if (accepted) return;
    const message = directory.getSnapshot().error;
    if (message !== null) {
      toastSeq.current += 1;
      setToast({ seq: toastSeq.current, text: t("error.action", { message }) });
    }
  };

  const choose = (selection) => {
    if (current && current.provider === selection.provider && current.model === selection.model) {
      close(true);
      return;
    }
    const preserveDefault = defaultChosen || !hasExplicitEffort;
    setChosenIndex(null);
    setDefaultChosen(false);
    lastActionRef.current = "select";
    const targetChoice = choices.find((c) =>
      c.selection.provider === selection.provider && c.selection.model === selection.model,
    );
    const targetReasoning = targetChoice ? targetChoice.model.reasoning : void 0;
    let finalSelection;
    if (preserveDefault) {
      // 保留 Default：不带 reasoningEffort，让新模型使用自己的默认。
      finalSelection = { provider: selection.provider, model: selection.model };
    } else {
      finalSelection = selection;
      const targetSupported = computeSupported(targetReasoning);
      const currentCanonical = appliedLevel ? appliedLevel.canonical : void 0;
      if (currentCanonical && currentCanonical !== "default") {
        const currentIdx = LEVELS.findIndex((level) => level.canonical === currentCanonical);
        if (currentIdx >= 0 && !targetSupported[currentIdx]) {
          const down = nearestSupportedBelow(targetSupported, currentIdx);
          if (down >= 0) {
            const effId = effortIdForCanonical(targetReasoning, LEVELS[down].canonical);
            if (effId !== void 0) finalSelection = { ...selection, reasoningEffort: effId };
            toastSeq.current += 1;
            setToast({ seq: toastSeq.current, text: t("downgrade.toast", { level: LEVELS[down].label }) });
          } else {
            toastSeq.current += 1;
            setToast({ seq: toastSeq.current, text: t("downgrade.default") });
          }
        } else if (currentIdx >= 0 && targetSupported[currentIdx]) {
          const effId = effortIdForCanonical(targetReasoning, LEVELS[currentIdx].canonical);
          if (effId !== void 0) finalSelection = { ...selection, reasoningEffort: effId };
        }
      }
    }
    select(finalSelection).then(settleSelection);
  };

  const chooseEffort = (index) => {
    if (current == null) return;
    const base = { provider: current.provider, model: current.model };
    const level = LEVELS[index];
    if (!level) return;
    setDefaultChosen(false);
    // The thumb always rests where the user clicked; unsupported positions
    // apply the nearest supported level below instead.
    setChosenIndex(index);
    if (supported[index]) {
      const effId = effortIdForCanonical(reasoning, level.canonical);
      if (effId === void 0) return;
      if (current.reasoningEffort === effId) return;
      lastActionRef.current = "select";
      select({ ...base, reasoningEffort: effId }).then(settleEffortSelection);
      return;
    }
    const down = nearestSupportedBelow(supported, index);
    if (down >= 0) {
      const effId = effortIdForCanonical(reasoning, LEVELS[down].canonical);
      if (effId !== void 0) {
        if (current.reasoningEffort !== effId) {
          lastActionRef.current = "select";
          select({ ...base, reasoningEffort: effId }).then(settleEffortSelection);
        }
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: t("downgrade.toast", { level: LEVELS[down].label }) });
        return;
      }
    }
    if (current.reasoningEffort !== void 0) {
      lastActionRef.current = "select";
      select(base).then(settleEffortSelection);
    }
    toastSeq.current += 1;
    setToast({ seq: toastSeq.current, text: t("downgrade.default") });
  };

  const chooseDefault = () => {
    if (current == null) return;
    setChosenIndex(null);
    setDefaultChosen(true);
    if (current.reasoningEffort === void 0) return;
    lastActionRef.current = "select";
    select({ provider: current.provider, model: current.model }).then(settleEffortSelection);
  };

  const chooseExtraEffort = (eff) => {
    if (current == null) return;
    setChosenIndex(null);
    setDefaultChosen(false);
    if (current.reasoningEffort === eff.id) return;
    lastActionRef.current = "select";
    select({ provider: current.provider, model: current.model, reasoningEffort: eff.id })
      .then(settleEffortSelection);
  };

  const modelLabel = currentChoice ? currentChoice.model.name : t("trigger.fallback");
  const triggerLabel = displayEffortLabel === void 0 ? modelLabel : `${modelLabel} · ${displayEffortLabel}`;
  const triggerAria = currentChoice === void 0
    ? t("trigger.selectAria")
    : effortLabel === void 0
      ? t("trigger.aria", { model: modelLabel })
      : t("trigger.ariaEffort", { model: modelLabel, effort: displayEffortLabel });

  itemRefs.current = [];
  let itemIndex = 0;
  const itemRef = () => {
    const at = itemIndex++;
    return (node) => {
      itemRefs.current[at] = node;
    };
  };

  const moveFocus = (offset) => {
    const items = itemRefs.current.filter((item) => item !== null);
    if (items.length === 0) return;
    const active = items.findIndex((item) => item === document.activeElement);
    items[(active + offset + items.length) % items.length]?.focus();
  };

  const onRootKeyDown = (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      if (pane !== "root") setPane("root");
      else close(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // 滑块 input 自己处理方向键，不要让菜单导航抢走事件。
      if (event.target instanceof HTMLInputElement && event.target.type === "range") return;
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const menuId = React.useId();
  const onBlur = (event) => {
    const related = event.relatedTarget;
    if (related instanceof Node && rootRef.current) {
      const host = typeof related.getRootNode === "function" ? related.getRootNode().host : null;
      if (rootRef.current.contains(related) || (host && rootRef.current.contains(host))) return;
    }
    close();
  };

  return React.createElement(
    "div",
    { ref: rootRef, className: "ds-effort-root", onKeyDown: onRootKeyDown, onBlur },
    // trigger
    React.createElement(
      "button",
      {
        ref: triggerRef,
        type: "button",
        className: "ds-effort-trigger" + (activeBars >= LEVELS.length - 1 ? " ds-effort-triggerMax" : ""),
        "aria-label": triggerAria,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : void 0,
        title: triggerLabel,
        disabled: locked,
        onClick: () => {
          if (open) close();
          else show();
        },
      },
      React.createElement("span", { className: "ds-effort-triggerLabel" }, modelLabel),
      displayEffortLabel !== void 0 && React.createElement("span", { className: "ds-effort-triggerEffort" }, displayEffortLabel),
      React.createElement(
        "svg",
        { className: "ds-effort-chevron" + (open ? " ds-effort-chevronOpen" : ""), viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true" },
        React.createElement("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
      ),
    ),
    // menu
    open && React.createElement(
      "div",
      { id: menuId, className: "ds-effort-menu", role: "menu", "aria-label": t("menu.aria"), "aria-busy": state && (state.status === "loading" || busy) },
      pane === "root" && [
        React.createElement(
          "button",
          { ref: itemRef(), type: "button", role: "menuitem", className: "ds-effort-cell", onClick: () => setPane("model") },
          React.createElement("span", { className: "ds-effort-cellLabel" }, t("menu.model")),
          React.createElement("span", { className: "ds-effort-cellValue" }, modelLabel),
          React.createElement("svg", { className: "ds-effort-cellChevron", viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true" },
            React.createElement("path", { d: "M6 4l4 4-4 4", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })),
        ),
        currentChoice !== void 0 && React.createElement(
          "button",
          { ref: itemRef(), type: "button", role: "menuitem", className: "ds-effort-cell", onClick: () => setPane("effort") },
          React.createElement("span", { className: "ds-effort-cellLabel" }, t("menu.effort")),
          React.createElement("span", { className: "ds-effort-cellValue" }, displayEffortLabel),
          React.createElement("svg", { className: "ds-effort-cellChevron", viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true" },
            React.createElement("path", { d: "M6 4l4 4-4 4", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })),
        ),
      ],
      pane === "model" && [
        state && state.status === "loading" && React.createElement("div", { className: "ds-effort-status" }, t("status.loading")),
        state && state.error !== null && lastActionRef.current === "load" && React.createElement(
          "div",
          { className: "ds-effort-error" },
          React.createElement("span", null, t("error.action", { message: state.error })),
          React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: reload }, t("retry")),
        ),
        state && Array.isArray(state.failures) && state.failures.map((failure) =>
          React.createElement(
            "div",
            { className: "ds-effort-warning", key: failure.id },
            React.createElement("span", null, t("warning.groupLoad", { name: failure.name, message: failure.message })),
            React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: reload }, t("retry")),
          ),
        ),
        React.createElement(
          "div",
          { className: "ds-effort-groups scrollable" },
          state && Array.isArray(state.groups) && state.groups.map((group) => {
            const headingId = "ds-effort-" + group.id;
            return React.createElement(
              "section",
              { role: "group", "aria-labelledby": headingId, className: "ds-effort-group", key: group.id },
              React.createElement("div", { className: "ds-effort-groupTitle", id: headingId }, group.name),
              group.models.map((model) => {
                const selected = current && current.provider === group.id && current.model === model.id;
                return React.createElement(
                  "button",
                  {
                    ref: itemRef(),
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": !!selected,
                    className: "ds-effort-option" + (selected ? " ds-effort-selected" : ""),
                    title: model.name,
                    disabled: busy,
                    key: model.id,
                    onClick: () => choose({ provider: group.id, model: model.id }),
                  },
                  React.createElement(
                    "span",
                    { className: "ds-effort-optionCopy" },
                    React.createElement("span", { className: "ds-effort-modelName" }, model.name),
                    model.description !== void 0 && React.createElement("span", { className: "ds-effort-description" }, model.description),
                  ),
                  selected && React.createElement("span", { className: "ds-effort-check" }, "✓"),
                );
              }),
            );
          }),
        ),
        state && state.status === "ready" && choices.length === 0 && React.createElement("div", { className: "ds-effort-empty" }, t("empty.models")),
      ],
      pane === "effort" && [
        state && state.error !== null && lastActionRef.current === "load" && React.createElement(
          "div",
          { className: "ds-effort-error" },
          React.createElement("span", null, t("error.action", { message: state.error })),
          React.createElement("button", { type: "button", className: "ds-effort-retry", onClick: reload }, t("action.reload")),
        ),
        reasoning === void 0
          ? [
              React.createElement("div", { key: "empty", className: "ds-effort-empty" }, t("empty.efforts")),
              React.createElement(
                "div",
                { key: "extras", className: "ds-effort-extras" },
                React.createElement(
                  "button",
                  {
                    ref: itemRef(),
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": isDefaultActive,
                    className: "ds-effort-extraItem" + (isDefaultActive ? " ds-effort-extraItemActive" : ""),
                    disabled: busy,
                    onClick: chooseDefault,
                  },
                  React.createElement("span", null, t("effort.providerDefault")),
                ),
              ),
            ]
          : [
              React.createElement(EffortSlider, {
                key: "slider",
                supported,
                value: sliderIndex,
                defaultActive: isDefaultActive,
                disabled: busy,
                onChange: chooseEffort,
                liang,
                chibi,
                onLiangChange: (next) => liangStore.set(next),
                labels: {
                  label: t("effort.title"),
                  axisLow: t("effort.axisLow"),
                  axisHigh: t("effort.axisHigh"),
                  tooltip: t("effort.tooltip"),
                  inputAria: t("effort.ariaLabel"),
                  helpAria: t("effort.helpAria"),
                  liangToggle: t("liang.toggle"),
                },
              }),
              React.createElement(
                "div",
                { key: "extras", className: "ds-effort-extras" },
                React.createElement(
                  "button",
                  {
                    ref: itemRef(),
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": isDefaultActive,
                    className: "ds-effort-extraItem" + (isDefaultActive ? " ds-effort-extraItemActive" : ""),
                    disabled: busy,
                    onClick: chooseDefault,
                  },
                  React.createElement("span", null, t("effort.providerDefault")),
                ),
                extraEfforts.map((eff) => {
                  const active = effectiveEffort === eff.id;
                  return React.createElement(
                    "button",
                    {
                      ref: itemRef(),
                      type: "button",
                      role: "menuitemradio",
                      "aria-checked": active,
                      className: "ds-effort-extraItem" + (active ? " ds-effort-extraItemActive" : ""),
                      disabled: busy,
                      key: eff.id,
                      onClick: () => chooseExtraEffort(eff),
                    },
                    React.createElement("span", null, eff.name),
                    active && React.createElement("span", { className: "ds-effort-check" }, "✓"),
                  );
                }),
              ),
            ],
      ],
    ),
    toast !== null && React.createElement(
      "div",
      { className: "ds-effort-toast", role: "status", key: toast.seq },
      toast.text,
      React.createElement("button", { type: "button", className: "ds-effort-toastClose", onClick: () => setToast(null), "aria-label": t("close") }, "×"),
    ),
  );
}

// --- Settings page switches --------------------------------------------------
// 大肥鱼 thumb 开关：注入 DSH「设置-通用设置」的 settings.general.item 插槽。
function ChibiThumbSetting({ t }) {
  // useSyncExternalStore：开关状态实时跟随 store，任何一处变更立即重渲染
  const enabled = React.useSyncExternalStore(chibiStore.subscribe, chibiStore.getSnapshot);
  // 插槽未注入 t 时回退到内嵌词典（zh/en 由页面 lang 决定）
  const txt = (key) => {
    if (t) return t(key);
    const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
    const dict = lang && lang.startsWith("en") ? DICT_EN : DICT_ZH;
    return dict[key] || key;
  };

  return React.createElement(
    "div",
    { className: "ds-effort-setting-row" },
    React.createElement(
      "div",
      { className: "ds-effort-setting-copy" },
      React.createElement("div", { className: "ds-effort-setting-title" }, txt("chibi.setting.title")),
      React.createElement("div", { className: "ds-effort-setting-description" }, txt("chibi.setting.description")),
    ),
    React.createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": enabled,
        className: "ds-effort-setting-switch" + (enabled ? " is-on" : ""),
        onClick: () => chibiStore.set(!enabled),
      },
      React.createElement("span", { className: "ds-effort-setting-knob" }),
    ),
  );
}

// --- locale dictionaries -----------------------------------------------------
const NS = "dsEffort";

const DICT_ZH = {
  "trigger.fallback": "选择模型",
  "trigger.selectAria": "选择模型",
  "trigger.aria": "选择模型，当前 {model}",
  "trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
  "menu.aria": "模型与推理等级",
  "menu.model": "模型",
  "menu.effort": "推理等级",
  "effort.providerDefault": "Default",
  "effort.title": "推理等级",
  "effort.axisLow": "更快",
  "effort.axisHigh": "更聪明",
  "effort.tooltip": "推理等级越高，思考时间越长。Max 会进行最深度的分析和代码检查。",
  "effort.ariaLabel": "推理等级",
  "effort.helpAria": "关于推理等级",
  "liang.toggle": "滑动变祖器",
  "chibi.setting.title": "大肥鱼滑块",
  "chibi.setting.description": "用大肥鱼替换滑块按钮",
  "downgrade.toast": "已降级到 {level}",
  "downgrade.default": "当前档位不可用，已回退到 Default",
  "status.loading": "正在刷新模型列表…",
  "error.action": "模型操作失败：{message}",
  "retry": "重试",
  "action.reload": "重新加载",
  "warning.groupLoad": "{name} 加载失败：{message}",
  "empty.models": "没有可用的模型。",
  "empty.efforts": "当前模型未提供推理等级。",
  "extra.efforts": "其他等级",
  "close": "关闭",
};

const DICT_EN = {
  "trigger.fallback": "Select model",
  "trigger.selectAria": "Select model",
  "trigger.aria": "Select model, current {model}",
  "trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
  "menu.aria": "Model and reasoning effort",
  "menu.model": "Model",
  "menu.effort": "Effort",
  "effort.providerDefault": "Default",
  "effort.title": "Reasoning effort",
  "effort.axisLow": "Faster",
  "effort.axisHigh": "Smarter",
  "effort.tooltip": "Higher effort spends more time reasoning. Max adds the deepest analysis and code pass.",
  "effort.ariaLabel": "Effort level",
  "effort.helpAria": "About effort levels",
  "liang.toggle": "Liang Calibrator",
  "chibi.setting.title": "Big Fat Fish slider",
  "chibi.setting.description": "Replace the slider thumb with the big fat fish",
  "downgrade.toast": "Downgraded to {level}",
  "downgrade.default": "This level is unavailable; fell back to Default",
  "status.loading": "Refreshing model list…",
  "error.action": "Model operation failed: {message}",
  "retry": "Retry",
  "action.reload": "Reload",
  "warning.groupLoad": "{name} failed to load: {message}",
  "empty.models": "No models available.",
  "empty.efforts": "This model provides no reasoning effort levels.",
  "extra.efforts": "Other levels",
  "close": "Close",
};

// --- CSS (deep/light via DSW alias tokens) ----------------------------------
const CSS = `
.ds-effort-root{position:relative;min-width:0}
.ds-effort-trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}
.ds-effort-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.ds-effort-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l2,var(--dsw-alias-brand-primary))}
.ds-effort-trigger:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.ds-effort-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.ds-effort-triggerEffort{color:var(--dsw-alias-label-tertiary);flex:none}
.ds-effort-triggerMax .ds-effort-triggerEffort{background:linear-gradient(90deg,#c9b9ea,#ae9aef,#a2c1ff,#c5b0f4,#c9b9ea);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ds-effort-trigger-flow 3.2s linear infinite}
@keyframes ds-effort-trigger-flow{to{background-position:200% center}}
.ds-effort-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .12s}
.ds-effort-chevronOpen{transform:rotate(180deg)}
.ds-effort-menu{z-index:20;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));width:min(252px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-y:auto;overflow-x:hidden;transform-origin:bottom right;animation:ds-effort-menu-in 160ms cubic-bezier(.22,.61,.36,1)}
@keyframes ds-effort-menu-in{from{opacity:0;transform:scale(.97) translateY(4px)}}
.ds-effort-status,.ds-effort-empty{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}
.ds-effort-error,.ds-effort-warning{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}
.ds-effort-warning{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-primary))}
.ds-effort-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600;white-space:nowrap}
.ds-effort-groups{display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.ds-effort-group{display:flex;flex-direction:column;gap:2px}
.ds-effort-groupTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;padding:6px 8px 2px}
.ds-effort-cell,.ds-effort-option{width:100%;border:0;background:0 0;border-radius:8px;cursor:pointer;display:flex;align-items:center;text-align:left}
.ds-effort-cell{padding:7px 8px;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-primary)}
.ds-effort-cell:hover,.ds-effort-option:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.ds-effort-cellLabel{font-size:13px;font-weight:500;line-height:20px}
.ds-effort-cellValue{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.ds-effort-cellChevron{color:var(--dsw-alias-label-tertiary);flex:none}
.ds-effort-option{padding:7px 8px;gap:8px}
.ds-effort-optionCopy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.ds-effort-modelName{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ds-effort-description{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.ds-effort-selected{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2))}
.ds-effort-check{color:var(--dsw-alias-brand-primary);flex:none;font-size:13px;line-height:20px}
.ds-effort-extra{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px}
.ds-effort-extraTitle{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;line-height:16px;padding:2px 2px 4px}
.ds-effort-extraItem{width:100%;border:0;background:0 0;border-radius:8px;cursor:pointer;padding:5px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);text-align:left}
.ds-effort-extraItem:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.ds-effort-extraItemActive{color:var(--dsw-alias-label-primary)}
.ds-effort-extras{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.ds-effort-extras .ds-effort-extraItem{width:auto;border:1px solid var(--dsw-alias-border-l1);padding:4px 10px;border-radius:999px;justify-content:flex-start}
.ds-effort-extras .ds-effort-extraItemActive{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.ds-effort-toast{position:absolute;top:calc(100% + 6px);right:0;z-index:30;max-width:280px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-primary));border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;font-size:12px;line-height:18px;display:flex;align-items:flex-start;gap:8px;box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));overflow:hidden;animation:ds-effort-toast-in 220ms cubic-bezier(.22,.61,.36,1)}
.ds-effort-toast::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:100%;background:currentColor;opacity:.45;animation:ds-effort-toast-countdown 2.6s linear forwards}
.ds-effort-toastClose{cursor:pointer;background:0 0;border:0;color:inherit;font-size:14px;line-height:18px;padding:0}
@keyframes ds-effort-toast-in{from{opacity:0;transform:translateX(8px)}}
@keyframes ds-effort-toast-countdown{from{width:100%}to{width:0%}}
@media (prefers-reduced-motion:reduce){.ds-effort-toast{animation:none}}
/* purple accent + dark variants for the Web Component */
ds-effort-slider{--ds-effort-accent:#8c73c9;--ds-effort-accent-deep:#a17ec2;--ds-effort-text:var(--dsw-alias-label-secondary,#5f5b58);--ds-effort-text-strong:var(--dsw-alias-label-primary,#3f3b38);--ds-effort-muted:var(--dsw-alias-label-tertiary,#77736f);--ds-effort-track:var(--dsw-alias-bg-layer-2,#edeae8);--ds-effort-track-fill:var(--dsw-alias-bg-layer-3,#e0dbd6);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));--ds-effort-outline:var(--dsw-alias-border-l1,rgba(76,70,65,.12))}
body[data-ds-dark-theme] ds-effort-slider{--ds-effort-accent:#a17ec2;--ds-effort-accent-deep:#b39ad6;--ds-effort-track:rgba(255,255,255,.08);--ds-effort-track-fill:rgba(255,255,255,.12);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));--light-color:#b9c8ff}
/* settings-page chibi switch */
.ds-effort-setting-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(121,126,145,.18))}
.ds-effort-setting-copy{min-width:0}
.ds-effort-setting-title{color:var(--dsw-alias-label-primary,#15171b);font-size:14px;font-weight:400;line-height:22px}
.ds-effort-setting-description{margin-top:3px;color:var(--dsw-alias-label-tertiary,#9296a0);font-size:12px;line-height:18px}
.ds-effort-setting-switch{position:relative;width:38px;height:22px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-fill-quaternary,#c7cbd3);cursor:pointer;transition:background 150ms ease;flex:none}
.ds-effort-setting-switch:hover{filter:brightness(.97)}
.ds-effort-setting-switch:focus-visible{outline:2px solid var(--dsw-static-blue-400,#5d83ff);outline-offset:2px}
.ds-effort-setting-switch.is-on{background:var(--dsw-alias-state-business-primary,#4f73ff)}
.ds-effort-setting-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform 170ms cubic-bezier(.22,1,.36,1)}
.ds-effort-setting-switch.is-on .ds-effort-setting-knob{transform:translateX(16px)}
`;

// --- plugin -------------------------------------------------------------------
return {
  inject: ["slots", "sessions", "modelDirectories", "timer", "locale"],  apply(ctx) {
    const slots = ctx.slots;
    const sessions = ctx.sessions;
    const models = ctx.modelDirectories;

    // Resolve the timer SERVICE object once, inside apply(): ctx.timeout /
    // ctx.interval are ctx mixins that lazily resolve the service through the
    // context, and the context goes INACTIVE after apply() returns. Holds only
    // the service instance so the Web Component can keep using timers later.
    const timerSvc = ctx.timer || ctx.get("timer");
    effortTiming = {
      timeout: (cb, delay) => timerSvc.timeout(cb, delay),
      interval: (cb, delay) => timerSvc.interval(cb, delay),
      raf: (cb) => timerSvc.interval(cb, 16),
    };

    const styleId = "dsh-client-ui-effort-slider/styles";
    if (typeof document !== "undefined" && !document.querySelector(`style[data-plugin-css="${styleId}"]`)) {
      const style = document.createElement("style");
      style.dataset.plugin = "dsh-client-ui-effort-slider";
      style.dataset.pluginCss = styleId;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const locale = ctx.locale || ctx.get("locale");
    if (locale) {
      ctx.effect(() => locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), "ds-effort-slider: dictionaries");
    }

    // 大肥鱼 thumb 开关 → DSH「设置-通用设置」插槽
    if (slots && typeof slots.inject === "function") {
      slots.inject("settings.general.item", () =>
        slots.register(
          { name: "settings.general.item", id: "effort-slider-chibi-thumb", order: 20 },
          ChibiThumbSetting,
        ),
      );
    }

    slots.inject("conversation.input.model", () => slots.register({
      name: "conversation.input.model",
      priority: -1,
      locale: NS,
      inject: (sessionId) => {
        const directory = models.directoryFor(sessionId);
        const available = sessions.subagentAddress(sessionId) === void 0;
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => {});
          },
          select: (selection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
        };
      },
    }, EffortModelSelect));
  },
};

  },
});
