#!/usr/bin/env node
// Seed the 25 built-in poster styles as APPROVED templates.
//
//   node scripts/seed-style-templates.mjs            # local dev backend
//   node scripts/seed-style-templates.mjs --prod     # production
//   node scripts/seed-style-templates.mjs --dir ~/somewhere/cropped
//
// Reads scripts/style-templates.json, uploads <dir>/<slug>.jpg|png for each
// entry, upserts the template by name, then runs the vision describe pass
// (layout spec + placeholder words) with the curated style notes appended.
// Args always go through execFileSync arrays: a shell would eat "$25".
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const dirFlag = argv.indexOf("--dir");
const dir = dirFlag >= 0 ? path.resolve(argv[dirFlag + 1]) : path.join(os.homedir(), "Desktop", "studio-styles", "cropped");
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1].split(",") : null;
const FORMAT = "4:5";
const SYSTEM = "brand";

const styles = JSON.parse(fs.readFileSync(path.join(here, "style-templates.json"), "utf8"));

function convexRun(fn, args) {
  const out = execFileSync(
    "npx",
    ["convex", "run", fn, JSON.stringify(args ?? {}), ...(prod ? ["--prod"] : [])],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 },
  );
  // `convex run` pretty-prints objects over several lines; parse from the
  // first JSON opener, fall back to the last (string) line.
  const text = out.trim();
  const start = text.search(/[{\["]/);
  if (start >= 0) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      /* fall through */
    }
  }
  const lines = text.split("\n").filter(Boolean);
  return (lines[lines.length - 1] ?? "").replace(/^"|"$/g, "");
}

function findImage(slug) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = path.join(dir, `${slug}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main() {
  console.log(`Seeding ${styles.length} styles → ${prod ? "PRODUCTION" : "local dev"} from ${dir}`);
  let ok = 0;
  const missing = [];
  for (const s of styles) {
    if (only && !only.includes(s.slug)) continue;
    const img = findImage(s.slug);
    if (!img) {
      missing.push(s.slug);
      continue;
    }
    process.stdout.write(`• ${s.name.padEnd(24)} `);
    const uploadUrl = convexRun("templatesSeed:seedUploadUrl", {});
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": MIME[path.extname(img).toLowerCase()] ?? "image/jpeg" },
      body: fs.readFileSync(img),
    });
    if (!res.ok) throw new Error(`upload failed for ${s.slug}: ${res.status}`);
    const { storageId } = await res.json();
    const { templateId, updated } = convexRun("templatesSeed:upsertStyleTemplate", {
      name: s.name,
      storageId,
      format: FORMAT,
      designSystem: SYSTEM,
      description: s.notes.split(":")[0].slice(0, 120),
    });
    process.stdout.write(updated ? "updated " : "created ");
    let described = null;
    for (let attempt = 1; attempt <= 2 && !described; attempt++) {
      try {
        described = convexRun("templatesActions:describeTemplateInternal", { templateId, styleNotes: s.notes });
      } catch (e) {
        if (attempt === 2) throw e;
        process.stdout.write("(retrying describe) ");
      }
    }
    console.log(`→ ${described.referenceText.length} placeholder words`);
    ok++;
  }
  console.log(`\nDone: ${ok} seeded.`);
  if (missing.length) {
    console.log(`Skipped, no image found: ${missing.join(", ")}`);
    console.log(`Expected files like ${path.join(dir, "<slug>.jpg")}`);
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
