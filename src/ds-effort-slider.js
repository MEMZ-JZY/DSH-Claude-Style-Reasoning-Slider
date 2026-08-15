const LEVELS = [
  { label: "Off", canonical: "off" },
  { label: "Low", canonical: "low" },
  { label: "Medium", canonical: "medium" },
  { label: "High", canonical: "high" },
  { label: "Extra", canonical: "extra" },
  { label: "Max", canonical: "max" },
];

// Level identity: non-Max slots are deliberately monochrome — a very subtle
// neutral gray that barely deepens with level, so the slider reads clean and
// the only color moment is Max, which keeps its vivid violet identity (pixel
// field + flowing gradient label). SOFT/DEEP are the lighter and darker poles
// used by fills and shadows.
const LEVEL_COLORS = [
  [158, 158, 158], // Off
  [151, 151, 151], // Low
  [144, 144, 144], // Medium
  [138, 138, 138], // High
  [131, 131, 131], // Extra
  [145, 85, 214],  // Max — vivid violet
];
const LEVEL_COLORS_SOFT = [
  [214, 214, 214],
  [210, 210, 210],
  [206, 206, 206],
  [202, 202, 202],
  [198, 198, 198],
  [186, 153, 230],
];
const LEVEL_COLORS_DEEP = [
  [120, 120, 120],
  [114, 114, 114],
  [108, 108, 108],
  [102, 102, 102],
  [96, 96, 96],
  [106, 56, 180],
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
      "label", "axis-low", "axis-high", "tooltip",
      "input-aria-label", "help-aria-label",
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
    this._hoverIndex = null;
    this._canvasFrame = 0;
    this._labelFrame = 0;
    this._labelTimer = 0;
    this._closeTimer = 0;
    this._lastCanvasFrame = 0;
    this._maxStartedAt = 0;
    this._reveal = 0;
    this._isMax = false;
    this._reflectingValue = false;
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
          --ds-effort-width: min(22.5rem, calc(100vw - 2rem));
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
          padding: 1rem 1.125rem;
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
          min-height: 2rem;
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
          content: "Default";
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

        :host([data-max]) .level-current,
        :host([data-max]) .trigger-value {
          background: linear-gradient(90deg, #b39ad6, #e066d9, #8bb0ff, #c898ff, #b39ad6);
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
          margin-top: 1.25rem;
          color: var(--ds-effort-muted);
          font-size: 0.875rem;
          font-weight: 450;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }

        .track-shell {
          position: relative;
          height: 2.75rem;
          margin-top: 0.75rem;
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
          left: -1px;
          right: -1px;
          border-radius: calc(var(--ds-effort-track-radius) + 1px);
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

        .track::before {
          content: "";
          position: absolute;
          z-index: 0;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            #eeebe9 0%,
            #e6e0ea 14%,
            #d8c9ec 30%,
            #c5a8e4 48%,
            #b08ddc 68%,
            #9d74d2 85%,
            #8f63cd 100%
          );
          opacity: 0;
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
            #eeebe9 0%,
            #e6e0ea 14%,
            #d8c9ec 30%,
            #c5a8e4 48%,
            #b08ddc 68%,
            #9d74d2 85%,
            #8f63cd 100%
          );
        }

        :host([data-max][data-pixels-ready]) .pixel-field {
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

        .level-labels {
          position: relative;
          height: 0.875rem;
          margin-top: 0.375rem;
        }

        .level-label {
          position: absolute;
          top: 0;
          left: calc(
            (100% - var(--ds-effort-thumb-w) - (var(--ds-effort-thumb-inset) * 2))
              * var(--tick-frac, 0)
            + (var(--ds-effort-thumb-inset) + var(--ds-effort-thumb-w) * 0.5)
          );
          transform: translateX(-50%);
          font-size: 0.625rem;
          font-weight: 500;
          line-height: 1;
          color: var(--ds-effort-muted);
          opacity: 0.15;
          white-space: nowrap;
          transition-property: color, font-weight, opacity, transform;
          transition-duration: 180ms;
          transition-timing-function: var(--ease-decay);
        }

        .level-label[data-disabled] {
          color: var(--ds-effort-muted);
          opacity: 0.12;
        }

        .level-label.is-active {
          color: var(--ds-effort-level-color);
          font-weight: 700;
          opacity: 1;
        }

        .level-label.is-hover {
          color: var(--ds-effort-level-color);
          opacity: 0.9;
          transform: translateX(-50%) translateY(-2px);
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
          margin-top: 0.5rem;
        }

        :host([inline]) .track-shell {
          margin-top: 0.5rem;
        }

        :host([inline]) .track-shell {
          margin-top: 0.5rem;
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
          .level-label,
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

          <div class="level-labels" aria-hidden="true"></div>
        </section>
      </div>
    `;

    this._panel = this.shadowRoot.querySelector(".panel");
    this._input = this.shadowRoot.querySelector(".range");
    this._track = this.shadowRoot.querySelector(".track");
    this._canvas = this.shadowRoot.querySelector(".pixel-field");
    this._ticksEl = this.shadowRoot.querySelector(".ticks");
    this._labelsEl = this.shadowRoot.querySelector(".level-labels");
    this._thumb = this.shadowRoot.querySelector(".thumb");
    this._currentLabel = this.shadowRoot.querySelector(".level-current");
    this._outgoingLabel = this.shadowRoot.querySelector(".level-outgoing");
    this._titlePrefix = this.shadowRoot.querySelector(".title > span:first-child");
    this._axisLow = this.shadowRoot.querySelector(".axis span:first-child");
    this._axisHigh = this.shadowRoot.querySelector(".axis span:last-child");
    this._tooltipText = this.shadowRoot.querySelector(".tooltip");
    this._trigger = this.shadowRoot.querySelector(".trigger");
    this._triggerValue = this.shadowRoot.querySelector(".trigger-value");
    this._bars = this.shadowRoot.querySelectorAll(".trigger-bar");
    this._helpWrap = this.shadowRoot.querySelector(".help-wrap");
    this._helpButton = this.shadowRoot.querySelector(".help-button");

    this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
    this._onReducedMotionChange = this._onReducedMotionChange.bind(this);
  }

  connectedCallback() {
    this._events?.abort();
    this._events = new AbortController();
    const { signal } = this._events;
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
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open && !this.hasAttribute("inline")) {
        event.preventDefault();
        this.close();
        this._trigger.focus();
      }
    }, { signal });
    // 鼠标靠近轨道时，高亮最近刻度的标签并移动光场；离开后恢复
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
      this._hoverIndex = Math.round(lx * (this._levels.length - 1));
      this._updateLabelHover();
    }, { signal });
    this._panel.addEventListener("pointerleave", () => {
      this.style.setProperty("--light-strength", "0");
      this._hoverIndex = null;
      this._updateLabelHover();
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

  _syncLevels() {
    if (!this._ticksEl) return;
    this._ticksEl.textContent = "";
    this._ticks = [];
    this._labels = [];
    if (this._labelsEl) this._labelsEl.textContent = "";
    for (let i = 0; i < this._levels.length; i += 1) {
      const tick = document.createElement("span");
      tick.className = "tick";
      this._ticksEl.appendChild(tick);
      this._ticks.push(tick);
      const label = document.createElement("span");
      label.className = "level-label";
      label.textContent = this._levels[i].label;
      if (this._labelsEl) this._labelsEl.appendChild(label);
      this._labels.push(label);
    }
    this._input.max = String(this._levels.length - 1);
    this._supportedSet = new Set(this._levels.map((_, i) => i));
    this._syncTickStates();
    this._setValue(this._value, { animateLabel: false, reflect: false });
  }

  _syncTickStates() {
    this.toggleAttribute(
      "data-max-supported",
      this._levels.some((level) => level.canonical === "max"),
    );
    for (let i = 0; i < this._ticks.length; i += 1) {
      const tick = this._ticks[i];
      tick.style.setProperty("--tick-frac", String(this._valueToDisplay(i)));
      tick.toggleAttribute("data-disabled", !this._isSupported(i));
    }
    for (let i = 0; i < this._labels.length; i += 1) {
      const label = this._labels[i];
      label.style.setProperty("--tick-frac", String(this._valueToDisplay(i)));
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
        if (candidate.size) set = candidate;
      }
    }
    // index 0 (Default) is ALWAYS treated as supported.
    set.add(0);
    for (const index of Array.from(set)) {
      if (index < 0 || index >= this._levels.length || !Number.isInteger(index)) set.delete(index);
    }
    this._supportedSet = new Set([...set].sort((a, b) => a - b));
    if (this._ticks.length) this._syncTickStates();
  }

  _isSupported(index) {
    return this._supportedSet ? this._supportedSet.has(index) : true;
  }

  _nearestSupported(target) {
    const set = this._supportedSet;
    if (!set || !set.size) return target;
    let nearest = Infinity;
    let best = target;
    for (const index of set) {
      const distance = Math.abs(index - target);
      if (distance < nearest) {
        nearest = distance;
        best = index;
      }
    }
    return best;
  }

  // Nearest supported index in a given direction from current.
  _stepSupported(from, delta) {
    const set = this._supportedSet;
    if (!set || !set.size) return clamp(from + delta, 0, this._levels.length - 1);
    const source = Math.round(from);
    if (delta === 0) return source;
    let index = source + (delta > 0 ? 1 : -1);
    while (index >= 0 && index < this._levels.length) {
      if (set.has(index)) return index;
      index += delta > 0 ? 1 : -1;
    }
    return source;
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
  }

  _onDocumentPointerDown(event) {
    if (this.open && !this.hasAttribute("inline") && !event.composedPath().includes(this)) this.close();
  }

  _onPointerDown() {
    if (this.disabled) return;
    this._dragging = true;
    this.setAttribute("data-dragging", "");
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

  _nearestSupportedFrom(probe) {
    const set = this._supportedSet;
    if (!set || !set.size) return probe;
    let nearest = Infinity;
    let best = probe;
    for (const index of set) {
      const distance = Math.abs(index - probe);
      if (distance < nearest) {
        nearest = distance;
        best = index;
      }
    }
    return best;
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
    if (this._labels) {
      this._labels.forEach((label, i) => {
        const supported = this._isSupported(i);
        label.classList.toggle("is-active", i === activeIndex && supported);
        label.toggleAttribute("data-disabled", !supported);
      });
    }
    this._updateLabelHover();
  }

  _updateLabelHover() {
    if (!this._labels) return;
    this._labels.forEach((label, i) => {
      label.classList.toggle(
        "is-hover",
        i === this._hoverIndex && i !== this._levelIndex && this._isSupported(i),
      );
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
    this._input.setAttribute("aria-valuetext", level ? level.label : "");
    this.style.setProperty(
      "--ds-effort-progress",
      String(this._valueToDisplay(safeValue)),
    );

    const color = this._levelColorAt(safeValue);
    this.style.setProperty("--ds-effort-level-color", rgb(color.base));
    this.style.setProperty("--ds-effort-level-soft", rgb(color.soft));
    this.style.setProperty("--ds-effort-level-deep", rgb(color.deep));
    this.setAttribute("data-level", String(nextIndex));
    this.toggleAttribute("data-glow", nextIndex >= 3);

    if (nextIndex !== previousIndex) {
      this._levelIndex = nextIndex;
      this._swapLabel(level ? level.label : "", nextIndex > previousIndex, animateLabel);
    } else if (this._currentLabel.textContent !== (level ? level.label : "")) {
      this._currentLabel.textContent = level ? level.label : "";
    }

    this._updateTicks(nextIndex);
    this._updateTriggerBars(nextIndex);

    this._triggerValue.textContent = level ? level.label : "";
    this._trigger.setAttribute("aria-label", `Effort level: ${level ? level.label : ""}`);
    this._setMax(Boolean(level && level.canonical === "max"));

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
    if (this._canvasFrame || !this._isMax || this._reducedMotion.matches) {
      this._drawPixelField(Date.now());
      return;
    }

    const frame = () => {
      const time = Date.now();
      if (!this._isMax || !this.isConnected) {
        this._cancelTimer("_canvasFrame");
        return;
      }
      if (time - this._lastCanvasFrame >= 33) {
        this._lastCanvasFrame = time;
        this._reveal = smoothstep(0, 1, (time - this._maxStartedAt) / 1000);
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
// __DS_EFFORT_STANDALONE_BOOTSTRAP__ (standalone browser only — stripped from
// the dynamic client half, where native timer globals are unavailable):
// assign the native-timer adapter so the standalone demo animates.
effortTiming = {
  timeout(cb, delay) {
    const id = setTimeout(cb, delay);
    return () => clearTimeout(id);
  },
  interval(cb, delay) {
    const id = setInterval(cb, delay);
    return () => clearInterval(id);
  },
  raf(cb) {
    let id = 0;
    let cancelled = false;
    const loop = (t) => {
      if (cancelled) return;
      cb(t);
      if (cancelled) return;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  },
};
// __DS_EFFORT_STANDALONE_BOOTSTRAP_END__
