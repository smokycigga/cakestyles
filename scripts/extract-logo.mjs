// One-shot generator: pulls the path data out of CakeStylesLogo.jsx and emits
// client/src/lib/logo.js so the SVG exists as data both React and the invoice
// renderer can consume. Run once; the output is committed.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("client/src/components/public/CakeStylesLogo.jsx", "utf8");

// Classify each <path .../> tag by whether it carries fill or stroke.
const filled = [];
const strokedPaths = [];
for (const tag of src.matchAll(/<path\b([^>]*)\/>/gs)) {
  const attrs = tag[1];
  const d = attrs.match(/\sd="([^"]+)"/);
  if (!d) continue;
  if (attrs.includes("stroke={color}")) {
    const w = attrs.match(/strokeWidth="([\d.]+)"/);
    strokedPaths.push({ d: d[1], width: Number(w?.[1] ?? 4.97) });
  } else {
    filled.push(d[1]);
  }
}

const lines = [...src.matchAll(
  /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke=\{color\} strokeWidth="([\d.]+)" \/>/g
)].map((m) => ({
  x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]), width: Number(m[5]),
}));

console.log(`filled: ${filled.length}, stroked paths: ${strokedPaths.length}, lines: ${lines.length}`);
if (filled.length + strokedPaths.length !== (src.match(/<path\b/g) || []).length) {
  throw new Error("path classification lost elements — check the regexes");
}
if (lines.length !== (src.match(/<line\b/g) || []).length) {
  throw new Error("line extraction lost elements — check the regexes");
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
const out = `// Cakestyles wordmark as data — the single source of truth for the logo.
// Consumed by:
//   - components/public/CakeStylesLogo.jsx (React SVG on the site)
//   - lib/invoiceRender.js (rasterized onto invoice PDF/PNG headers)
// Keep this file and the JSX in sync; both render identical markup.

export const LOGO_W = 1927;
export const LOGO_H = 438;

/** Filled letterform paths. */
export const LOGO_FILLED = [
${filled.map((d) => `  "${esc(d)}",`).join("\n")}
];

/** Stroked decorations: straight rules and open curves. */
export const LOGO_STROKED = [
${lines.map((l) => `  { line: { x1: ${l.x1}, y1: ${l.y1}, x2: ${l.x2}, y2: ${l.y2} }, width: ${l.width} },`).join("\n")}
${strokedPaths.map((s) => `  { d: "${esc(s.d)}", width: ${s.width} },`).join("\n")}
];

/** Complete standalone SVG markup (used for rasterization). */
export const logoSvg = (color) =>
  \`<svg xmlns="http://www.w3.org/2000/svg" width="\${LOGO_W}" height="\${LOGO_H}" viewBox="0 0 \${LOGO_W} \${LOGO_H}" fill="none">\` +
  LOGO_FILLED.map((d) => \`<path d="\${d}" fill="\${color}"/>\`).join("") +
  LOGO_STROKED.map((s) =>
    s.line
      ? \`<line x1="\${s.line.x1}" y1="\${s.line.y1}" x2="\${s.line.x2}" y2="\${s.line.y2}" stroke="\${color}" stroke-width="\${s.width}"/>\`
      : \`<path d="\${s.d}" stroke="\${color}" stroke-width="\${s.width}" fill="none"/>\`
  ).join("") +
  \`</svg>\`;

/**
 * Rasterize the wordmark to a canvas for the invoice painters.
 * Resolves null if the browser refuses to load the SVG, in which case the
 * invoice falls back to the store name in text.
 */
const rasterCache = new Map();
export function renderLogo(width = 360, color = "#6d2141") {
  const key = \`\${width}|\${color}\`;
  if (rasterCache.has(key)) return rasterCache.get(key);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const height = Math.max(1, Math.round((width * LOGO_H) / LOGO_W));
      const canvas = document.createElement("canvas");
      // 2x internal scale keeps the wordmark crisp in print-sized renders.
      canvas.width = width * 2;
      canvas.height = height * 2;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(logoSvg(color));
  });

  rasterCache.set(key, promise);
  return promise;
}
`;

writeFileSync("client/src/lib/logo.js", out);
console.log("wrote client/src/lib/logo.js");
