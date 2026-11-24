// Post-build step for the static export, run after `next build`:
// 1. Adds flat aliases for segment prefetch files (see below).
// 2. Generates out/sw.js, which precaches every file so the field flow loads with no connection.
import { createHash } from "node:crypto";
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const OUT = "out";
// 404.html is also exported as 404/index.html; with cleanUrls the .html path only answers with a redirect.
const SKIP = [/\.map$/, /^sw\.js$/, /\.txt$/, /^404\.html$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// The router prefetches /cases/__next.cases.__PAGE__.txt, but the export writes
// /cases/__next.cases/__PAGE__.txt. Static hosts cannot map one to the other, so we write
// a flat copy next to the folder. Without it, every link prefetch logs a 404.
let aliases = 0;
for (const file of walk(OUT)) {
  const parts = relative(OUT, file).split(sep);
  const i = parts.findIndex((p) => p.startsWith("__next.") && p !== basename(file));
  if (i === -1) continue;
  const flatName = parts.slice(i).join(".");
  copyFileSync(file, join(OUT, ...parts.slice(0, i), flatName));
  aliases++;
}
if (aliases > 0) console.log(`Segment prefetch aliases written: ${aliases}`);

const files = walk(OUT)
  .map((f) => relative(OUT, f).split(sep).join("/"))
  .filter((f) => !SKIP.some((re) => re.test(f)))
  .sort();

const hash = createHash("sha256");
const urls = files.map((f) => {
  hash.update(f);
  hash.update(readFileSync(join(OUT, f)));
  // Pages are exported as /route/index.html and served at /route/.
  if (f === "index.html") return "/";
  if (f.endsWith("/index.html")) return `/${f.slice(0, -"index.html".length)}`;
  return `/${f}`;
});
const version = hash.digest("hex").slice(0, 12);
const template = readFileSync("scripts/sw-template.js", "utf8");
const sw = template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(urls));
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`Service worker generated: ${urls.length} files precached, version ${version}`);
