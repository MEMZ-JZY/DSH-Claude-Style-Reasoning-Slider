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
- **Max / Ultracode treatment** — the model's `max`/`ultracode` level turns the
  slider into an animated purple pixel field, and the `Max` label becomes a
  flowing multi-color gradient text.
- **Localized and theme-aware** — ships with English and Simplified Chinese
  dictionaries and follows DSH light/dark design tokens.
- **Accessible** — keyboard-operable slider (arrows, Home/End, PageUp/PageDown),
  ARIA labels, focus management, and `prefers-reduced-motion` support.

## Install

Install the bundle from a Git repository:

```sh
dsh plugin --profile web add github:YOUR_ACCOUNT/dsh-client-ui-effort-slider
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
4. When switching models, the plugin preserves the current effort level where
   supported; otherwise it downgrades to the nearest supported level below or
   falls back to `Default`, always with a toast.

## UI effects

- **Trigger chip** — shows the current model and effort label, six rising
  signal bars that fill with the current level, and a chevron. At `Max` the
  effort label flows as a purple gradient.
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
- **Max pixel field** — at `Max` the track becomes an animated purple pixel
  field with a reveal sweep and flowing cell flicker; the `Max` label uses a
  flowing multi-color gradient.
- **Motion safety** — effects use CSS transitions/animations or lightweight
  event handlers, with no JS animation loops, and `prefers-reduced-motion` is
  respected.

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
theme switching, and the Max pixel field.

## Package contract

This is a DSH bundle, not a dynamic `cordis_define` snippet. The package uses:

- `dsh.bundle.patch` (`cordis.patch.yml`) for self-registration.
- `dsh.client.platform: web` for the browser half.
- `lib/client.js` as a prebuilt ModuleLoader artifact, generated from `src/`.

## Files

- `src/ds-effort-slider.js` — standalone Web Component (shadow DOM, no framework).
- `src/client.js` — React wrapper + forked model selector plugin logic.
- `scripts/build-client.mjs` — bundle generator.
- `demo/index.html` — standalone UI demo.
