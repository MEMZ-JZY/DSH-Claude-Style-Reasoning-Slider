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
.ds-effort-menu{z-index:20;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));width:min(256px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3,0 12px 28px rgba(0,0,0,.12));color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:auto}
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
