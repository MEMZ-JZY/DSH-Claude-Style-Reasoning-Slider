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
            0 0 0 3px color-mix(in srgb, var(--ds-effort-level-color) 24%, transparent),
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
          .track::before,
          .track-fill,
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
              <div class="thumb"></div>
            </div>
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
    this.toggleAttribute(
      "data-max-supported",
      this._levels.some((level) => level.canonical === "max"),
    );
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


// =============================================================================
// ds-effort-slider — client plugin logic (React wrapper + forked ModelSelect)
// This file is a FRAGMENT. scripts/build-client.mjs prepends the Web Component
// source from src/ds-effort-slider.js into the same function scope, providing
// LEVELS, the color/math helpers, the effortTiming adapter and the element.
// Edit the component ONLY in src/ds-effort-slider.js; never paste a copy here.
// The demo/ page loads that component source directly.
// =============================================================================

// Canonical level tokens, ordered left to right. "default" is the special
// leftmost slot that submits without reasoningEffort; "off" is a real level.
const CANONICAL_ORDER = ["off", "low", "medium", "high", "extra", "max"];
const DEFAULT_ALIASES = new Set([
  "default", "off", "none", "disabled", "no", "auto",
  "no reasoning", "no-reasoning", "no_reasoning",
  "no effort", "no_effort",
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
// the special Default slot; "off" is a real first level; unknown names
// return undefined so they can be appended as adapter-specific extras.
function canonicalToken(name) {
  const n = normalizeName(name);
  if (!n) return "default";
  if (DEFAULT_ALIASES.has(n)) return n === "default" ? "default" : "off";
  if (MAX_ALIASES.has(n)) return "max";
  for (const token of CANONICAL_ORDER) {
    if (n === token) return token;
    if (n.includes(` ${token}`) || n.includes(`${token} `)) return token;
  }
  if (n === "med" || n === "mid") return "medium";
  if (n === "extreme") return "extra";
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

function effortIdForCanonical(reasoning, canonical) {
  if (!reasoning || !Array.isArray(reasoning.efforts)) return void 0;
  const eff = reasoning.efforts.find((e) => canonicalToken(e.name) === canonical);
  return eff ? eff.id : void 0;
}

// --- React wrapper around <ds-effort-slider> -------------------------------
// React renders the custom element; all non-string interactions happen through
// a ref + effect so we never fight React's attribute serialization.
function EffortSlider(props) {
  const { supported, value, disabled, onChange, labels } = props;
  const ref = React.useRef(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

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
    inline: true,
    label: labels && labels.label,
    "axis-low": labels && labels.axisLow,
    "axis-high": labels && labels.axisHigh,
    tooltip: labels && labels.tooltip,
    "input-aria-label": labels && labels.inputAria,
    "help-aria-label": labels && labels.helpAria,
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

  const supported = React.useMemo(() => computeSupported(reasoning), [reasoning]);

  // The level that is actually applied (may differ from the user's chosen
  // slider position when the chosen level is not supported by the model).
  const appliedLevel = React.useMemo(() => {
    if (reasoning === void 0) return void 0;
    const effId = effectiveEffort;
    if (effId === void 0) return { label: t("effort.providerDefault"), canonical: "default" };
    const name = effortNameForId(reasoning, effId);
    return { label: name || effId, canonical: canonicalToken(name) };
  }, [reasoning, effectiveEffort, t]);

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
  const activeBars = Math.round(sliderIndex);

  const effortLabel = defaultChosen
    ? t("effort.providerDefault")
    : (appliedLevel ? appliedLevel.label : void 0);

  // Adapter-specific strengths that do not map to a slider level.
  const extraEfforts = React.useMemo(() => {
    if (!reasoning || !Array.isArray(reasoning.efforts)) return [];
    return reasoning.efforts.filter((eff) => canonicalToken(eff.name) === void 0);
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
    setChosenIndex(null);
    setDefaultChosen(false);
    lastActionRef.current = "select";
    const targetChoice = choices.find((c) =>
      c.selection.provider === selection.provider && c.selection.model === selection.model,
    );
    const targetReasoning = targetChoice ? targetChoice.model.reasoning : void 0;
    let finalSelection = selection;
    const targetSupported = computeSupported(targetReasoning);
    const currentCanonical = appliedLevel ? appliedLevel.canonical : "default";
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
      if (effectiveEffort === effId) return;
      lastActionRef.current = "select";
      select({ ...base, reasoningEffort: effId }).then(settleEffortSelection);
      return;
    }
    const down = nearestSupportedBelow(supported, index);
    if (down >= 0) {
      const effId = effortIdForCanonical(reasoning, LEVELS[down].canonical);
      if (effId !== void 0) {
        if (effectiveEffort !== effId) {
          lastActionRef.current = "select";
          select({ ...base, reasoningEffort: effId }).then(settleEffortSelection);
        }
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: t("downgrade.toast", { level: LEVELS[down].label }) });
        return;
      }
    }
    if (effectiveEffort !== void 0) {
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
    if (effectiveEffort === eff.id) return;
    setDefaultChosen(false);
    lastActionRef.current = "select";
    select({ provider: current.provider, model: current.model, reasoningEffort: eff.id })
      .then(settleEffortSelection);
  };

  const modelLabel = currentChoice ? currentChoice.model.name : t("trigger.fallback");
  const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
  const triggerAria = currentChoice === void 0
    ? t("trigger.selectAria")
    : effortLabel === void 0
      ? t("trigger.aria", { model: modelLabel })
      : t("trigger.ariaEffort", { model: modelLabel, effort: effortLabel });

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
    items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();
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
      effortLabel !== void 0 && React.createElement("span", { className: "ds-effort-triggerEffort" }, effortLabel),
      React.createElement("span", { className: "ds-effort-triggerBars", "aria-hidden": "true" },
        LEVELS.map((level, i) =>
          React.createElement("span", {
            key: i,
            className: "ds-effort-bar" + (i <= activeBars ? " ds-effort-barOn" : ""),
          }),
        ),
      ),
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
        reasoning !== void 0 && React.createElement(
          "button",
          { ref: itemRef(), type: "button", role: "menuitem", className: "ds-effort-cell", onClick: () => setPane("effort") },
          React.createElement("span", { className: "ds-effort-cellLabel" }, t("menu.effort")),
          React.createElement("span", { className: "ds-effort-cellValue" }, effortLabel),
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
        [
          React.createElement(EffortSlider, {
            key: "slider",
            supported,
            value: sliderIndex,
            disabled: busy,
            onChange: chooseEffort,
            labels: {
              label: t("effort.title"),
              axisLow: t("effort.axisLow"),
              axisHigh: t("effort.axisHigh"),
              tooltip: t("effort.tooltip"),
              inputAria: t("effort.ariaLabel"),
              helpAria: t("effort.helpAria"),
            },
          }),
          React.createElement(
            "div",
            { key: "extras", className: "ds-effort-extras" },
            React.createElement(
              "button",
              {
                type: "button",
                role: "menuitemradio",
                "aria-checked": Boolean(defaultChosen || (appliedLevel && appliedLevel.canonical === "default")),
                className: "ds-effort-extraItem" + (defaultChosen || (appliedLevel && appliedLevel.canonical === "default")
                  ? " ds-effort-extraItemActive"
                  : ""),
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
.ds-effort-triggerBars{display:inline-flex;align-items:flex-end;gap:2px;height:14px;flex:none}
.ds-effort-bar{width:3px;border-radius:1px;background:var(--dsw-alias-label-tertiary);opacity:.35;transition:opacity .15s}
.ds-effort-bar:nth-child(1){height:30%}
.ds-effort-bar:nth-child(2){height:44%}
.ds-effort-bar:nth-child(3){height:58%}
.ds-effort-bar:nth-child(4){height:72%}
.ds-effort-bar:nth-child(5){height:86%}
.ds-effort-bar:nth-child(6){height:100%}
.ds-effort-barOn{opacity:1;background:var(--dsw-alias-brand-primary)}
.ds-effort-triggerMax{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent)}
.ds-effort-triggerMax .ds-effort-triggerEffort{background:linear-gradient(90deg,#b39ad6,#e066d9,#8bb0ff,#c898ff,#b39ad6);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ds-effort-trigger-flow 3.2s linear infinite}
@keyframes ds-effort-trigger-flow{to{background-position:200% center}}
.ds-effort-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .12s}
.ds-effort-chevronOpen{transform:rotate(180deg)}
.ds-effort-menu{z-index:20;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));width:min(256px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:auto;transform-origin:bottom right;animation:ds-effort-menu-in 160ms cubic-bezier(.22,.61,.36,1)}
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
.ds-effort-toast{position:absolute;top:calc(100% + 6px);right:0;z-index:30;max-width:280px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;font-size:12px;line-height:18px;display:flex;align-items:flex-start;gap:8px;box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12))}
.ds-effort-toastClose{cursor:pointer;background:0 0;border:0;color:inherit;font-size:14px;line-height:18px;padding:0}
/* purple accent + dark variants for the Web Component */
ds-effort-slider{--ds-effort-accent:#8c73c9;--ds-effort-accent-deep:#a17ec2;--ds-effort-text:var(--dsw-alias-label-secondary,#5f5b58);--ds-effort-text-strong:var(--dsw-alias-label-primary,#3f3b38);--ds-effort-muted:var(--dsw-alias-label-tertiary,#77736f);--ds-effort-track:var(--dsw-alias-bg-layer-2,#edeae8);--ds-effort-track-fill:var(--dsw-alias-bg-layer-3,#e0dbd6);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));--ds-effort-outline:var(--dsw-alias-border-l1,rgba(76,70,65,.12))}
body[data-ds-dark-theme] ds-effort-slider{--ds-effort-accent:#a17ec2;--ds-effort-accent-deep:#b39ad6;--ds-effort-track:rgba(255,255,255,.08);--ds-effort-track-fill:rgba(255,255,255,.12);--ds-effort-surface:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1))}
`;

// --- plugin -------------------------------------------------------------------
return {
  inject: ["slots", "sessions", "modelDirectories", "timer", "locale"],
  apply(ctx) {
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
