import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const fence = /```mermaid[^\n]*\n([\s\S]*?)```/g;

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exited ${code}\n${out}\n${err}`));
    });
  });
}

async function walk(dir) {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

function stripSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*>\s*/g, "")
    .replace(/<!DOCTYPE[^>]*>\s*/g, "")
    .replace(/@keyframes\s+[\w-]+\s*\{[^{}]*\{[^{}]*\}[^{}]*\}/g, "")
    .replace(/animation:[^;}"]+;?/g, "")
    .trim();
}

export async function renderMermaid(srcDir, destDir, siteRoot) {
  await rm(destDir, { recursive: true, force: true });
  await cp(srcDir, destDir, { recursive: true });

  const files = (await walk(destDir)).filter((file) => file.endsWith(".md"));
  const jobs = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    fence.lastIndex = 0;
    if (fence.test(text)) jobs.push(file);
  }
  if (jobs.length === 0) return 0;

  const mmdc = path.join(siteRoot, "node_modules", ".bin", "mmdc");
  const config = path.join(siteRoot, "mermaid.config.json");
  const fontFile = path.join(siteRoot, "static", "fonts", "public-sans-latin-wght-normal.woff2");
  const fontCss = path.join(siteRoot, ".build", "mermaid-font.css");
  await mkdir(path.dirname(fontCss), { recursive: true });
  await writeFile(
    fontCss,
    `@font-face{font-family:"Public Sans";src:url("file://${fontFile}") format("woff2");font-weight:100 900;font-style:normal;font-display:block;}`,
  );

  const work = await mkdtemp(path.join(tmpdir(), "mmd-"));

  let count = 0;
  try {
    for (const file of jobs) {
      const text = await readFile(file, "utf8");
      const parts = [];
      let last = 0;
      fence.lastIndex = 0;
      let match;
      while ((match = fence.exec(text)) !== null) {
        const id = count++;
        const inFile = path.join(work, `${id}.mmd`);
        const outFile = path.join(work, `${id}.svg`);
        await writeFile(inFile, match[1].replace(/\s+$/, "") + "\n");
        await run(
          mmdc,
          ["-i", inFile, "-o", outFile, "-c", config, "-C", fontCss, "-b", "transparent", "-q", "-I", `diagram-${id}`],
          siteRoot,
        );
        const svg = stripSvg(await readFile(outFile, "utf8"));
        parts.push(text.slice(last, match.index));
        parts.push(`<figure class="diagram">\n${svg}\n</figure>\n`);
        last = match.index + match[0].length;
      }
      parts.push(text.slice(last));
      await writeFile(file, parts.join(""));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return count;
}
