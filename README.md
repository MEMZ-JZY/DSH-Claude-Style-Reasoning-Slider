# DSH Claude Style Reasoning Slider

An animated reasoning-effort slider and model picker for **DeepSeek Harness (DSH)**.
It replaces the native model selector's `conversation.input.model` slot with a
compatible selector whose reasoning pane is a Claude-style animated slider.

> 🇨🇳 中文版说明请见 [README.zh.md](README.zh.md)

## Preview

![DSH Effort Slider preview](assets/dsh-effort-slider-preview.png)

## Features

- **Drop-in model selector** — replaces only the `conversation.input.model` slot;
  the rest of the chat input stays untouched.
- **Canonical effort slider** — always shows `Off | Low | Medium | High | Extra | Max`
  positions, regardless of how the provider names its levels.
- **Tolerant name matching** — aliases such as `off`, `none`, `disabled`,
  `ultracode` → `max`, `med` → `medium`, `extreme` → `extra`, and similar
  display names are mapped to canonical slider positions.
- **Unsupported levels stay visible** — a level the current model does not
  support is dimmed but remains clickable. Clicking it keeps the thumb on the
  chosen slot and applies the nearest supported level **below** it, with a toast
  explaining the downgrade.
- **Model switching preserves effort** — when you switch models, the current
  effort is kept when possible, or automatically downgraded to the nearest
  supported level below it (with a toast).
- **Default and adapter-specific strengths** — `Default` is offered as a pill
  below the slider and submits without `reasoningEffort` (the provider's own
  default applies). Other provider strengths that do not map to a canonical
  slider position are also shown as selectable pills.
- **Models without reasoning metadata stay manageable** — when DSH does not
  expose `reasoning`/`efforts` for the selected model (for example some
  OpenRouter or hand-declared custom entries), the Effort menu still appears:
  it shows a short “no effort levels” notice plus the safe `Default` pill,
  instead of hiding every thinking-strength control.
- **Liang Calibrator (滑动变祖器)** — optional, off by default. Binds the six
  canonical levels to stage names: `Off → 小难梁`, `Low → 牢梁`,
  `Medium → 梁子`, `High → 梁圣`, `Extra → 梁神`, `Max → 梁祖`. When enabled,
  a 31-frame portrait (`frame-00`…`frame-30`) appears above the slider and
  follows the thumb continuously while dragging, then snaps to the segment's
  first frame on release. Labels and the trigger show `Max 梁祖`-style suffixes.
  The setting persists in `localStorage`.
- **Big Fat Fish thumb** — optional, off by default. Replaces the slider thumb
  with an 8-frame running chibi fish sprite. The idle animation loops at
  `720ms`, speeds up to `420ms` while dragging, and freezes under
  `prefers-reduced-motion`. Toggle it in DSH **Settings → General → Big Fat Fish
  slider**; changes apply immediately and persist in `localStorage`.
- **High / Extra ripple field** — `High` and `Extra` now show a sparse blue /
  purple dot-matrix field with random flicker and radial water ripples around
  the thumb, as a lighter prelude to the `Max` pixel field.
- **Max / Ultracode treatment** — the model's `max`/`ultracode` level turns the
  slider into an animated purple pixel field, and the `Max` label becomes a
  flowing multi-color gradient text.
- **Localized and theme-aware** — ships with English and Simplified Chinese
  dictionaries and follows DSH light/dark design tokens.
- **Accessible** — keyboard-operable slider (arrows, Home/End, PageUp/PageDown),
  ARIA labels, focus management, and `prefers-reduced-motion` support.

## Install

Install the bundle from the Git repository:

```sh
dsh plugin --profile web add github:MEMZ-JZY/DSH-Claude-Style-Reasoning-Slider
dsh --profile web
```

Or use a local checkout:

```sh
dsh plugin --profile web add ./dsh-client-ui-effort-slider
```

Restart the web profile after installing or removing the bundle.

## Usage

1. Click the model/effort trigger chip in the conversation input.
2. In the popup menu, choose **Model** to switch models, or **Effort** to adjust
   the reasoning level of the current model.
3. In the effort pane:
   - Drag or click the slider to pick `Off`, `Low`, `Medium`, `High`, `Extra`,
     or `Max`.
   - If a position is unsupported, the thumb stays where you clicked and the
     nearest supported level below is applied; a toast tells you what happened.
   - Click **Default** to remove `reasoningEffort` and let the provider decide.
   - Click any extra pill to apply a provider-specific strength that does not
     map to a slider position.
   - If the model has no declared reasoning levels, the pane shows a notice
     and only the **Default** pill. For providers that do support effort but
     are configured without `reasoningEfforts` (common with custom OpenRouter
     routes), add the levels in DSH's `llm-pi-ai` settings to get the full
     slider back.
4. When switching models, the plugin preserves the current effort level where
   supported; otherwise it downgrades to the nearest supported level below or
   falls back to `Default`, always with a toast.
5. To enable the **Liang Calibrator**, click the `滑动变祖器` switch below the
   track. The portrait and stage-name suffixes turn on immediately; the state
   is remembered across sessions.
6. To enable the **Big Fat Fish thumb**, open DSH **Settings → General** and turn
   on **Big Fat Fish slider**. The thumb changes immediately without a restart.

## UI effects

- **Trigger chip** — shows the current model and effort label, six rising
  signal bars that fill with the current level, and a chevron. At `Max` the
  effort label flows as a purple gradient. With the Liang Calibrator enabled it
  also shows stage suffixes such as `Max 梁祖`.
- **Two-level popup menu** — a compact menu with a model list (grouped by
  provider) and an effort pane; loading/error/retry states are included.
- **Glass track** — inner bevel shadows and a subtle fractal-noise layer break
  up flat-color banding.
- **Light field** — the track responds to the pointer like a light source: an
  interior light pool and a glass-edge highlight follow the cursor, brightening
  as the pointer approaches and fading with distance. The light is suppressed
  at `Max` so the pixel field stays clean.
- **Level labels** — faint tick labels; the current level is always shown,
  hovering near a slot highlights it, and others stay barely visible.
- **Liang portrait** — when the Liang Calibrator is enabled, a `224px` square
  portrait appears above the track. It uses 31 WebP frames (`frame-00`…
  `frame-30`) that change continuously while dragging and keep the original
  scanline + light-spot texture.
- **Liang toggle indicator** — the `滑动变祖器` switch below the track uses a
  dot indicator: a gray dot when off, a glowing purple dot when on.
- **High / Extra dot-matrix ripple** — `High` (blue) and `Extra` (purple) show a
  sparse particle field that expands from the thumb, flickers randomly, and
  animates bright/dark water ripples radiating outward.
- **Max pixel field** — at `Max` the track becomes an animated purple pixel
  field with a reveal sweep and flowing cell flicker; the `Max` label uses a
  flowing multi-color gradient.
- **Big Fat Fish thumb** — when enabled, the thumb becomes an 8-frame running
  chibi fish sprite. It loops at `720ms` when idle, `420ms` while dragging, and
  freezes under reduced motion. The left edge stays aligned and the right edge
  is clamped so the fish never overflows.
- **Motion safety** — effects use CSS transitions/animations or lightweight
  event handlers, and `prefers-reduced-motion` is respected.

## Development

Build the client bundle from source:

```sh
npm install
npm run build
```

`lib/client.js` is generated from `src/client.js` plus `src/ds-effort-slider.js`
by `scripts/build-client.mjs`.

Run the standalone component demo:

```sh
# open demo/index.html in a browser
```

The demo page exercises panel mode, inline mode, supported-level combinations,
theme switching, the Max pixel field, the Liang Calibrator, and the Big Fat Fish
thumb.

## Package contract

This is a DSH bundle, not a dynamic `cordis_define` snippet. The package uses:

- `dsh.bundle.patch` (`cordis.patch.yml`) for self-registration.
- `dsh.client.platform: web` for the browser half.
- `lib/client.js` as a prebuilt ModuleLoader artifact, generated from `src/`.
- `index.js` as the host half: it mounts an `/effort-slider-assets/` static
  route that serves `assets/liang-frames/*.webp` and
  `assets/chibi-runner-strip.png` to the browser half.

## Files

- `index.js` — host half; serves the Liang portrait frames and chibi sprite.
- `src/ds-effort-slider.js` — standalone Web Component (shadow DOM, no framework).
- `src/client.js` — React wrapper + forked model selector plugin logic.
- `scripts/build-client.mjs` — bundle generator.
- `demo/index.html` — standalone UI demo.
- `assets/` — `liang-frames/` (31 WebP frames) and `chibi-runner-strip.png`.
