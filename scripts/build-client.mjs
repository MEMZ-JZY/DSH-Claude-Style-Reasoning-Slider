import { mkdir, readFile, writeFile } from "node:fs/promises";

const component = await readFile(new URL("../src/ds-effort-slider.js", import.meta.url), "utf8");
const plugin = await readFile(new URL("../src/client.js", import.meta.url), "utf8");

// Strip the standalone browser timing bootstrap. The DSH client half never
// sees native timer globals; the plugin's apply() injects the timer-service
// adapter instead. The demo/ page keeps the bootstrap so it animates.
const BOOTSTRAP_START = "// __DS_EFFORT_STANDALONE_BOOTSTRAP__";
const BOOTSTRAP_END = "// __DS_EFFORT_STANDALONE_BOOTSTRAP_END__";
const startIdx = component.indexOf(BOOTSTRAP_START);
const endIdx = component.indexOf(BOOTSTRAP_END);
const componentBody = startIdx >= 0 && endIdx > startIdx
  ? component.slice(0, startIdx) + component.slice(endIdx + BOOTSTRAP_END.length)
  : component;

const body = `${componentBody}\n${plugin}`;
const output = `window.__ModuleLoader__.load({
  id: "dsh-client-ui-effort-slider",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    ${body}
  },
});
`;
await mkdir(new URL("../lib/", import.meta.url), { recursive: true });
await writeFile(new URL("../lib/client.js", import.meta.url), output);
