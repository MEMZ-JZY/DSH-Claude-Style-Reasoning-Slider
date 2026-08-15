# DSH Effort Slider

A publishable DeepSeek Harness bundle that replaces only the native model
selector's `conversation.input.model` slot with a compatible selector whose
reasoning pane is a Claude-style animated slider.

The slider always shows the canonical positions
`Off | Low | Medium | High | Extra | Max`. Levels the current model does not
support are dimmed but remain clickable: clicking one keeps the thumb on the
chosen slot and applies the nearest supported level below it (for example
`Extra` downgrades to `High`), with a toast explaining the change.

`Default` and any adapter-specific strengths that do not map to a canonical
slider position are offered as selectable pills below the slider. `Default`
submits without `reasoningEffort` (the provider's own default applies);
the other pills submit their provider level id directly.

Canonical names (`off`, `low`, `medium`, `high`, `extra`, `max`, plus aliases
such as `ultracode` -> `max`) are matched tolerantly. When switching models,
the applied level is preserved when possible and otherwise downgraded to the
nearest supported level below it, with a toast explaining the change. The
original purple Ultracode-style pixel field is attached to the model's
`max`/`ultracode` level.

## Install

```sh
dsh plugin --profile web add github:YOUR_ACCOUNT/dsh-client-ui-effort-slider
dsh --profile web
```

For a local checkout:

```sh
dsh plugin --profile web add ./dsh-client-ui-effort-slider
```

Restart the web profile after installing or removing the bundle.

## Package contract

This is a DSH bundle, not a dynamic `cordis_define` snippet. The package uses
`dsh.bundle.patch` for self-registration and `dsh.client.platform: web` for the
browser half. `lib/client.js` is generated from `src/client.js` by `npm run
build` and is a prebuilt ModuleLoader artifact.
