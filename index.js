import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * dsh-client-ui-effort-slider — host half.
 *
 * Pure service half: serves the 滑动变祖器 portrait keyframes
 * (frame-00..frame-30.webp) and the 大肥鱼 chibi thumb sprite under
 * `/effort-slider-assets/` so the browser half never needs a CDN or a
 * patched static server. The UI itself lives in `./client` (see package.json
 * `dsh.client`).
 */

/** Stable Cordis plugin name. */
export const name = "dsh-client-ui-effort-slider";
/** Services required before the asset route can be mounted. */
export const inject = ["webServer"];

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

/** The asset root this file owns: `<package>/assets` (index.js sits at the
 * package root, unlike lib/-style layouts). */
const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "assets");

/**
 * Mount the asset route on the profile's web server.
 * @param ctx - host plugin context carrying the `webServer` service.
 */
export function apply(ctx) {
  // 用 ctx.effect 延迟注册：DSH 启动时序中 webServer 可能晚于本插件就绪
  ctx.effect(() =>
    ctx.webServer.register({
      kind: "prefix",
      path: "/effort-slider-assets",
      handler: async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        /* v8 ignore next -- node:http always sets url on server requests. */
        const rawUrl = req.url ?? "/";
        if (rawUrl.includes("..")) {
          res.writeHead(403);
          res.end();
          return;
        }
        const rawPath = decodeURIComponent(new URL(rawUrl, "http://x").pathname);
        const rel = rawPath.slice("/effort-slider-assets".length).replace(/^\/+/, "");
        const target = resolve(normalize(join(assetsRoot, rel)));
        if (target !== assetsRoot && !target.startsWith(assetsRoot + sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        try {
          const body = await readFile(target);
          res.writeHead(200, {
            "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
            "content-length": body.length,
            "cache-control": "public, max-age=86400",
          });
          res.end(req.method === "HEAD" ? undefined : body);
        } catch (error) {
          res.writeHead(404);
          res.end();
        }
      },
    }),
  );
}
