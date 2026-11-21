import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMermaid } from "./render-mermaid.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = process.argv.includes("--fixtures");

function hugoBin() {
  if (process.env.HUGO_BIN) return process.env.HUGO_BIN;
  const local = "/home/cyb3rcy6er/.local/bin/hugo";
  if (existsSync(local)) return local;
  return "hugo";
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} exited ${code}`));
    });
  });
}

function frontMatterDraft(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^draft:\s*true\s*$/m.test(match[1]);
}

async function prepareFixtures(dest) {
  await rm(dest, { recursive: true, force: true });
  await cp(path.join(siteRoot, "content"), dest, { recursive: true });
  const writing = path.join(dest, "writing");
  await mkdir(writing, { recursive: true });
  const names = (await readdir(path.join(siteRoot, "fixtures"))).filter((name) => name.endsWith(".md"));
  for (const name of names) {
    const raw = await readFile(path.join(siteRoot, "fixtures", name), "utf8");
    if (frontMatterDraft(raw)) continue;
    await writeFile(path.join(writing, name), raw);
  }
}

const destination = fixtures ? "public-fixture" : "public";
const source = fixtures ? path.join(siteRoot, ".build", "fixture-src") : path.join(siteRoot, "content");
if (fixtures) await prepareFixtures(source);

const rendered = path.join(siteRoot, ".build", "content");
const diagrams = await renderMermaid(source, rendered, siteRoot);
await run(
  hugoBin(),
  ["--contentDir", rendered, "--destination", destination, "--minify", "--cleanDestinationDir"],
  siteRoot,
);
console.log(`built ${destination} (${diagrams} diagram${diagrams === 1 ? "" : "s"})`);
