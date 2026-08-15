import { mkdir, readFile, writeFile } from "node:fs/promises";

const body = await readFile(new URL("../src/client.js", import.meta.url), "utf8");
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
