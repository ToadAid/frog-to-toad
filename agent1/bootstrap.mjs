#!/usr/bin/env node
// Agent1 bootstrap — Day 0 ceremony. Plain node, zero dependencies, no network.
// Fail-closed order: constitution verify → clone detection → genesis receipt.
// The code writes the receipt; Agent1 writes the voice.

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

export function boot({ repoRoot = resolve(HERE, ".."), storesDir = join(HERE, "stores"), now = new Date().toISOString() } = {}) {
  // 1. Constitution verify — pinned SHAs, computed locally, no network.
  const lock = JSON.parse(readFileSync(join(HERE, "config", "constitution.lock.json"), "utf8"));
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

  // 2. Clone detection — stores must be empty. Agent1 starts from nothing.
  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  if (statSync(journalPath).size !== 0) {
    throw new BootRefused("stores/journal.jsonl is non-empty — clone detected. Agent1 starts from nothing.");
  }
  const memory = JSON.parse(readFileSync(memoryPath, "utf8"));
  if (memory && Object.keys(memory).length !== 0) {
    throw new BootRefused("stores/memory.json is non-empty — clone detected. Agent1 starts from nothing.");
  }

  // 3. Genesis receipt — structural only; the first reflective entry is Agent1's own.
  mkdirSync(storesDir, { recursive: true });
  const genesis = {
    ts: now,
    type: "genesis",
    note: "boot complete; constitution verified; stores were empty at boot; first reflective entry belongs to Agent1",
    constitution: verified.map(v => `${v.path}@${v.sha.slice(0, 12)}`),
    sourceCommit: lock.sourceCommit,
  };
  appendFileSync(journalPath, JSON.stringify(genesis) + "\n");

  return { ok: true, verified, genesis };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const r = boot();
    console.log(`Agent1 booted. Constitution verified: ${r.verified.length} docs @ ${r.genesis.sourceCommit.slice(0, 12)}`);
    for (const v of r.verified) console.log(`  ok ${v.path} @ ${v.sha.slice(0, 12)}`);
    console.log("Genesis receipt written. Stage 0 — Eyes. Stop at the human authority boundary.");
  } catch (e) {
    console.error(`BOOT REFUSED: ${e.message}`);
    process.exit(1);
  }
}
