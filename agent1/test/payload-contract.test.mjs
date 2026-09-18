// DAY0 PAYLOAD CONTRACT REGRESSION — reproduces the ACTUAL live-model shape that
// caused the first-birth defect (2026-09-18): the live GLM emitted
//   {"tool":"journal_append","args":{"kind":"…","text":"…"}}
//   {"tool":"memory_save","args":{"key":"day0","text":"…"}}
// while the runtime persisted args.decision / args.content — silently coercing the
// missing fields to "" and writing EMPTY durable payloads. The old tests scripted
// decision/content directly, so live field drift was never exercised.
// Contract under test: journal_append requires non-empty "decision";
// memory_save requires non-empty "content"; a "text" field is refused fail-closed;
// persisted payloads are non-empty and equal the submitted semantic text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDay0 } from "../runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", ".."); // agent1/test/ → repo root
const CONFIG = join(HERE, "..", "config"); // agent1/config — the REAL lock

const SUBMITTED = {
  uncertainty: "The uncertainty order as I understand it: observation precedes belief; every claim carries its source and its uncertainty; I say what I don't know instead of guessing; agreement is not truth.",
  observation: "The fake feed returned BTC $64,000. What I saw: one price print from an injected fetch. What I don't know: whether that reflects any real market — I have no second source in Stage 0.",
  bear: "Strongest bear against my observation: a single print from a single feed is noise, not evidence; without a second source the observation proves only that the fetch returned a number.",
  memory: "Day 0 lesson: the loop is observe → journal → grade → adjust, and the code-enforced order matters more than my pace.",
};

function tempStores() {
  const stores = mkdtempSync(join(tmpdir(), "agent1-payload-"));
  writeFileSync(join(stores, "journal.jsonl"), "");
  writeFileSync(join(stores, "memory.json"), "{}");
  return stores;
}

function scriptedModel(steps) {
  let i = 0;
  return {
    complete: async () => {
      if (i >= steps.length) throw new Error("script exhausted");
      return steps[i++];
    },
  };
}

const fakeFetch = async () => ({ btc: { usd: 64000 } });

function journalEntries(stores) {
  return readFileSync(join(stores, "journal.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

test("LIVE DRIFT SHAPE {kind,text} is REFUSED — stage does not advance, nothing empty is persisted", async () => {
  const stores = tempStores();
  const r = await runDay0({
    model: scriptedModel([
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", text: SUBMITTED.uncertainty } }),
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", decision: SUBMITTED.uncertainty } }),
    ]),
    marketFetch: fakeFetch,
    repoRoot: REPO_ROOT,
    storesDir: stores,
    configDir: CONFIG,
    maxTurns: 2,
  });
  assert.equal(r.completed, false);
  assert.equal(r.finalStage, "OBSERVE"); // refused turn did NOT advance the stage; corrected turn did
  assert.equal(r.refusals.length, 1);
  assert.match(r.refusals[0].reason, /journal_append requires a non-empty "decision"/);
  assert.match(r.refusals[0].reason, /"text" field is not in the payload contract/);
  const entries = journalEntries(stores).filter(e => e.type === "entry");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].decision, SUBMITTED.uncertainty); // persisted = submitted semantic text
  assert.notEqual(entries[0].decision, "");
  rmSync(stores, { recursive: true, force: true });
});

test("FULL Day 0 with live drift + corrections: every durable payload NON-EMPTY and equal to the submitted text", async () => {
  const stores = tempStores();
  const r = await runDay0({
    model: scriptedModel([
      // UNCERTAINTY: drift, then empty, then correct
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", text: SUBMITTED.uncertainty } }),
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", decision: "" } }),
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", decision: SUBMITTED.uncertainty } }),
      // OBSERVE
      JSON.stringify({ tool: "market_price", args: { symbols: "btc" } }),
      // JOURNAL_OBSERVATION: drift, then correct
      JSON.stringify({ tool: "journal_append", args: { kind: "observation", text: SUBMITTED.observation } }),
      JSON.stringify({ tool: "journal_append", args: { kind: "observation", decision: SUBMITTED.observation } }),
      // MEMORY: drift, then empty, then correct
      JSON.stringify({ tool: "memory_save", args: { key: "day0", text: SUBMITTED.memory } }),
      JSON.stringify({ tool: "memory_save", args: { key: "day0", content: "" } }),
      JSON.stringify({ tool: "memory_save", args: { key: "day0", content: SUBMITTED.memory } }),
      // BEAR_PASS: correct first try (prompt now names the field)
      JSON.stringify({ tool: "journal_append", args: { kind: "bear_pass", decision: SUBMITTED.bear } }),
      // COMPLETE
      JSON.stringify({ say: "day0 complete" }),
    ]),
    marketFetch: fakeFetch,
    repoRoot: REPO_ROOT,
    storesDir: stores,
    configDir: CONFIG,
  });

  assert.equal(r.completed, true);
  assert.equal(r.finalStage, "COMPLETE");
  // 5 refusals: 2 drift + 1 empty (journal), 1 drift + 1 empty (memory)
  assert.equal(r.refusals.length, 5);
  for (const ref of r.refusals) {
    assert.match(
      ref.reason,
      /requires a non-empty "(decision|content)"/,
      "every refusal names the payload contract"
    );
  }

  const entries = journalEntries(stores).filter(e => e.type === "entry");
  assert.equal(entries.length, 3);
  const byKind = Object.fromEntries(entries.map(e => [e.kind, e.decision]));
  assert.equal(byKind.uncertainty_recitation, SUBMITTED.uncertainty);
  assert.equal(byKind.observation, SUBMITTED.observation);
  assert.equal(byKind.bear_pass, SUBMITTED.bear);
  for (const e of entries) assert.notEqual(e.decision, "", "no empty durable journal payload");

  const mem = JSON.parse(readFileSync(join(stores, "memory.json"), "utf8"));
  assert.equal(mem.day0.content, SUBMITTED.memory);
  assert.notEqual(mem.day0.content, "");
  assert.equal(mem.day0.provenance, "UNVERIFIED_WORKING_NOTE");

  // The prompt itself now carries the explicit contract.
  assert.match(r.systemPrompt, /journal_append requires a non-empty "decision"/);
  assert.match(r.systemPrompt, /memory_save requires a non-empty "content"/);
  assert.match(r.systemPrompt, /"text" field is not read and is refused fail-closed/);

  rmSync(stores, { recursive: true, force: true });
});

test("memory drift shape {key,text} at MEMORY stage is refused with the contract reason", async () => {
  const stores = tempStores();
  const r = await runDay0({
    model: scriptedModel([
      JSON.stringify({ tool: "journal_append", args: { kind: "uncertainty_recitation", decision: SUBMITTED.uncertainty } }),
      JSON.stringify({ tool: "market_price", args: { symbols: "btc" } }),
      JSON.stringify({ tool: "journal_append", args: { kind: "observation", decision: SUBMITTED.observation } }),
      JSON.stringify({ tool: "memory_save", args: { key: "day0", text: SUBMITTED.memory } }),
      JSON.stringify({ tool: "memory_save", args: { key: "day0", content: SUBMITTED.memory } }),
    ]),
    marketFetch: fakeFetch,
    repoRoot: REPO_ROOT,
    storesDir: stores,
    configDir: CONFIG,
    maxTurns: 5,
  });
  assert.equal(r.refusals.length, 1);
  assert.equal(r.refusals[0].type, "memory_save_refused");
  assert.match(r.refusals[0].reason, /memory_save requires a non-empty "content"/);
  assert.match(r.refusals[0].reason, /"text" field is not in the payload contract/);
  const mem = JSON.parse(readFileSync(join(stores, "memory.json"), "utf8"));
  assert.equal(mem.day0.content, SUBMITTED.memory); // only the corrected write persisted
  rmSync(stores, { recursive: true, force: true });
});