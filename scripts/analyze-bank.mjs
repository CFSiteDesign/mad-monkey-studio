#!/usr/bin/env node
// Analyse every image-bank photo with macOS Vision and store the results:
// pixel size, subject box, face band (so layouts keep text off faces) and,
// where the photo has people big enough, a transparent cut-out PNG.
//
//   node scripts/analyze-bank.mjs            # local dev backend
//   node scripts/analyze-bank.mjs --prod     # production
//   node scripts/analyze-bank.mjs --prod --force   # redo photos already analysed
//
// Needs macOS 14+ (Vision subject lifting) and Xcode command-line tools
// (swiftc). Re-run after new photos are uploaded: it only processes photos
// Vision hasn't analysed yet. Args go through execFileSync arrays, never a
// shell string (a shell would eat "$" in data).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const force = argv.includes("--force");

function convexRun(fn, args) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args ?? {}), ...(prod ? ["--prod"] : [])], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  const start = out.search(/[{\["]/);
  if (start >= 0) {
    try {
      return JSON.parse(out.slice(start));
    } catch {
      /* fall through */
    }
  }
  return out.split("\n").pop().replace(/^"|"$/g, "");
}

// Compile the Vision tool once into a cache dir.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "mm-analyze-"));
const bin = path.join(os.tmpdir(), "mm-analyze-photo");
const swiftSrc = path.join(here, "analyze-photo.swift");
if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(swiftSrc).mtimeMs) {
  console.log("Compiling the Vision tool…");
  execFileSync("swiftc", ["-O", swiftSrc, "-o", bin], { stdio: "inherit" });
}

const rows = convexRun("imageBankAdmin:listForAnalysis", {});
const todo = rows.filter((r) => force || r.analysisSource !== "vision");
console.log(`${rows.length} photos in the bank (${prod ? "PRODUCTION" : "local dev"}), ${todo.length} to analyse.`);

let done = 0, cutouts = 0, failed = 0;
for (const r of todo) {
  const img = path.join(work, `${r.id}.img`);
  const png = path.join(work, `${r.id}.png`);
  try {
    const res = await fetch(r.url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    fs.writeFileSync(img, Buffer.from(await res.arrayBuffer()));
    // Graphics (flyers, posters, collages, diagrams, menus) never get a cut-out.
    const graphic = /flyer|poster|promotional|multi-panel|collage|diagram|flowchart|menu|map\b|infographic/i.test(r.description ?? "");
    const a = JSON.parse(execFileSync(bin, graphic ? [img, png, "--no-cutout"] : [img, png], { encoding: "utf8" }).trim().split("\n").pop());
    if (a.error) throw new Error(a.error);
    const update = { imageId: r.id, source: "vision", width: a.width, height: a.height };
    if (a.subject) update.subjectBox = a.subject;
    if (a.faces) update.faceBand = a.faces;
    update.hasText = Boolean(a.hasText);
    if (a.cutout && fs.existsSync(png)) {
      const uploadUrl = convexRun("imageBankAdmin:analysisUploadUrl", {});
      const up = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: fs.readFileSync(png) });
      if (!up.ok) throw new Error(`cut-out upload ${up.status}`);
      const { storageId } = await up.json();
      Object.assign(update, { cutoutStorageId: storageId, cutoutWidth: a.cutout.width, cutoutHeight: a.cutout.height });
      if (a.sliced) update.cutoutSliced = a.sliced;
      cutouts++;
    }
    convexRun("imageBankAdmin:setAnalysis", update);
    done++;
    process.stdout.write(`\r${done}/${todo.length} analysed, ${cutouts} cut-outs`);
  } catch (e) {
    failed++;
    console.log(`\n✗ ${r.id}: ${e.message ?? e}`);
  } finally {
    fs.rmSync(img, { force: true });
    fs.rmSync(png, { force: true });
  }
}
console.log(`\nDone: ${done} analysed, ${cutouts} cut-outs, ${failed} failed.`);
