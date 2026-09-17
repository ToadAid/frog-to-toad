#!/usr/bin/env node
// Agent1 bootstrap — Day 0 ceremony. Plain node, zero dependencies, no network.
// Fail-closed order: constitution verify → identity anchor → genesis receipt (first boot only).
// v2: resume-aware identity anchor — clone detection applies to PRE-GENESIS contamination,
// not to Agent1's own post-genesis life. Boot #2+ with a valid genesis = resume.

import { createHash } from "node:crypto";
import { existsSync, appendFileSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export class BootRefused extends Error {}

function gitBlobSha1(buf) {
  const h = createHash("sha1");
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest("hex");
}

function readMemoryState(memoryPath) {
  if (!existsSync(memoryPath)) return { missing: true };
  const raw = readFileSync(memoryPath, "utf8");
  let parsed = null;
  try {
    parsed = JSON.parse(raw || "null");
  } catch {
    return { corrupt: true };
  }
  const empty = parsed === null || (typeof parsed === "object" && Object.keys(parsed).length === 0);
  return { empty, parsed };
}

export function boot({ repoRoot = resolve(HERE, ".."), storesDir = join(HERE, "stores"), configDir = join(HERE, "config"), now = new Date().toISOString() } = {}) {
  // 1. Constitution verify — pinned SHAs, computed locally, no network.
  const lock = JSON.parse(readFileSync(join(configDir, "constitution.lock.json"), "utf8"));
  const verified = [];
  for (const doc of lock.documents) {
    const p = join(repoRoot, doc.path);
    if (!existsSync(p)) throw new BootRefused(`constitution doc missing: ${doc.path}`);
    const sha = gitBlobSha1(readFileSync(p));
    if (sha !== doc.gitBlobSha1) {
      throw new BootRefused(`constitution mismatch: ${doc.path} pinned ${doc.gitBlobSha1} found ${sha}`);
    }
    verified.push({ path: doc.path, sha });
  }

  // 2. Identity anchor — the journal's first record is Agent1's birth certificate.
  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  const journalExists = existsSync(journalPath);
  const journalEmpty = !journalExists || statSync(journalPath).size === 0;
  const mem = readMemoryState(memoryPath);
  if (mem.missing || mem.corrupt) {
    throw new BootRefused(`stores/memory.json ${mem.missing ? "missing" : "corrupt"} — stores ship with both files; refusing fail-closed`);
  }

  if (journalEmpty) {
    if (!mem.empty) {
      throw new BootRefused("memory non-empty before any genesis — pre-genesis contamination refused. Agent1 starts from nothing.");
    }
    // First boot: write the genesis receipt (full SHAs — the resume anchor).
    mkdirSync(storesDir, { recursive: true });
    const genesis = {
      ts: now,
      type: "genesis",
      note: "boot complete; constitution verified; stores were empty at boot; first reflective entry belongs to Agent1",
      constitution: verified.map(v => ({ path: v.path, sha: v.sha })),
      sourceCommit: lock.sourceCommit,
    };
    appendFileSync(journalPath, JSON.stringify(genesis) + "\n");
    return { ok: true, mode: "first-boot", verified, genesis };
  }

  // Journal non-empty: first record must be a valid genesis matching the CURRENT lock.
  let first;
  try {
    first = JSON.parse(readFileSync(journalPath, "utf8").split("\n", 1)[0]);
  } catch {
    throw new BootRefused("first journal record unparsable — foreign/pre-genesis history refused (clone detected)");
  }
  if (!first || first.type !== "genesis") {
    throw new BootRefused("first journal record is not a genesis receipt — foreign/pre-genesis history refused (clone detected)");
  }
  const g = first.constitution;
  if (!Array.isArray(g) || g.length !== verified.length) {
    throw new BootRefused("genesis constitution record malformed — refusing fail-closed");
  }
  for (let i = 0; i < verified.length; i++) {
    if (g[i]?.path !== verified[i].path || g[i]?.sha !== verified[i].sha) {
      throw new BootRefused(`genesis constitution mismatch at ${verified[i].path} — constitution changed since genesis; re-anchor requires a principal-approved re-pin`);
    }
  }
  if (first.sourceCommit !== lock.sourceCommit) {
    throw new BootRefused(`genesis sourceCommit ${first.sourceCommit} != lock ${lock.sourceCommit} — constitution re-pinned since genesis; re-anchor requires a principal-approved re-pin`);
  }
  // Resume: Agent1's own post-genesis life. No new genesis is written.
  return { ok: true, mode: "resume", verified, genesis: first };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const r = boot();
    console.log(`Agent1 booted (${r.mode}). Constitution verified: ${r.verified.length} docs @ ${r.genesis.sourceCommit.slice(0, 12)}`);
    for (const v of r.verified) console.log(`  ok ${v.path} @ ${v.sha.slice(0, 12)}`);
    if (r.mode === "first-boot") console.log("Genesis receipt written.");
    console.log("Stage 0 — Eyes. Stop at the human authority boundary.");
  } catch (e) {
    console.error(`BOOT REFUSED: ${e.message}`);
    process.exit(1);
  }
}