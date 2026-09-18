// reconcile-day0.test.mjs v2 — tests for the Day 0 reconciliation repair (PR #10).
// Fixtures reproduce the ACTUAL first-birth log shape: "[turn N @ STAGE] {json action}"
// + "[ok] tool → result". NO real first-birth log is used (it lives on the principal
// machine). Historical stores reproduce the real empty-shell defect shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcile, ReconcileRefused } from "../reconciliation/reconcile-day0.mjs";

const SOURCE_COMMIT = "7429d270deadbeefcafe1234567890abcdef1234";
const GENESIS = JSON.stringify({
  type: "genesis",
  sourceCommit: SOURCE_COMMIT,
  constitution: [
    { path: "agent1/LAW/doctrine.md", sha: "9355673d", kind: "LAW" },
    { path: "agent1/LAW/witness.md", sha: "7ce39ebf", kind: "LAW" },
    { path: "agent1/LAW/principles.md", sha: "c5c2fdb2", kind: "LAW" },
    { path: "agent1/CONTEXT/recipe.md", sha: "d8c41e2c", kind: "CONTEXT" },
    { path: "agent1/CONTEXT/lessons.md", sha: "aabd1d9c", kind: "CONTEXT" },
  ],
});
const ORIG_MEM_TS = "2026-09-18T17:21:40.885Z";

// ACTUAL structural shape of the first-birth log (per principal review)
const LOG = [
  "Agent1 booted (first-boot). Constitution verified: 5 docs @ 7429d270",
  "Genesis receipt written.",
  '[turn 1 @ UNCERTAINTY] {"tool":"journal_append","args":{"kind":"uncertainty_recitation","text":"I cannot verify my own constitution contents beyond SHA identity; I proceed under fail-closed refusal defaults."}}',
  "[ok] journal_append → recorded",
  '[turn 2 @ OBSERVE] {"tool":"market_price","args":{"symbol":"btc"}}',
  "[ok] market_price → {\"btc\":{\"usd\":117000}}",
  '[turn 3 @ JOURNAL_OBSERVATION] {"tool":"journal_append","args":{"kind":"observation","text":"BTC spot observed at boot; recording observation entry."}}',
  "[ok] journal_append → recorded",
  '[turn 4 @ MEMORY] {"tool":"memory_save","args":{"key":"day0","text":"First birth: constitution bound, genesis written, day0 stages walked."}}',
  "[ok] memory_save → saved",
  '[turn 5 @ BEAR_PASS] {"tool":"journal_append","args":{"kind":"bear_pass","text":"Bear: first-run tool surface unproven; mitigation: refusals logged fail-closed."}}',
  "[ok] journal_append → recorded",
  '[turn 6 @ COMPLETE] {"say":"day0 complete"}',
].join("\n") + "\n";

// Historical stores in the REAL defect shape: [ok] receipts, empty-shell payloads
function emptyShell(kind) {
  return JSON.stringify({ ts: "2026-09-18T17:21:40.000Z", type: "entry", kind, symbol: "DAY0", decision: "", outcome: "" });
}
const EMPTY_JOURNAL = [GENESIS,
  emptyShell("uncertainty_recitation"),
  emptyShell("observation"),
  emptyShell("bear_pass"),
].join("\n") + "\n";
const EMPTY_MEMORY = JSON.stringify({ day0: { content: "", provenance: "UNVERIFIED_WORKING_NOTE", ts: ORIG_MEM_TS } }, null, 2) + "\n";

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "rec2-"));
  const stores = join(dir, "stores");
  mkdirSync(stores, { recursive: true });
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL);
  writeFileSync(join(stores, "memory.json"), EMPTY_MEMORY);
  const log = join(dir, "firstboot.log");
  writeFileSync(log, LOG);
  return { dir, stores, log };
}
const NOW = () => "2026-09-18T23:59:00.000Z";

test("1. exact live-shape happy path (dry-run then apply)", () => {
  const { dir, stores, log } = rig();
  const dry = reconcile({ logPath: log, storesDir: stores, now: NOW, apply: false });
  assert.equal(dry.dryRun, true);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL); // untouched
  const r = reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true });
  assert.equal(r.ok, true);
  const jLines = readFileSync(join(stores, "journal.jsonl"), "utf8").split("\n").filter(l => l.trim());
  assert.equal(jLines.length, 5); // genesis + 3 empty shells + 1 receipt
  const rec = JSON.parse(jLines[4]);
  assert.equal(rec.type, "reconciliation");
  assert.equal(rec.ts, "2026-09-18T23:59:00.000Z"); // receipt ts = NOW, never backdated
  assert.equal(rec.originalMemoryTs, ORIG_MEM_TS);
  assert.equal(rec.recovered.UNCERTAINTY, "I cannot verify my own constitution contents beyond SHA identity; I proceed under fail-closed refusal defaults.");
  assert.equal(rec.recovered.BEAR_PASS, "Bear: first-run tool surface unproven; mitigation: refusals logged fail-closed.");
  assert.deepEqual(rec.observeEvidence, { action: { symbol: "btc" }, toolResult: '{"btc":{"usd":117000}}' });
  const mem = JSON.parse(readFileSync(join(stores, "memory.json"), "utf8"));
  assert.equal(mem.day0.content, "First birth: constitution bound, genesis written, day0 stages walked.");
  assert.equal(mem.day0.provenance, "UNVERIFIED_WORKING_NOTE");
  assert.equal(mem.day0.ts, ORIG_MEM_TS); // original memory timestamp preserved
  rmSync(dir, { recursive: true, force: true });
});

test("2. dry-run does not mutate either store", () => {
  const { dir, stores, log } = rig();
  reconcile({ logPath: log, storesDir: stores, now: NOW, apply: false });
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("3. exact semantic recovery including MEMORY", () => {
  const { dir, stores, log } = rig();
  const r = reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true });
  assert.deepEqual(Object.keys(r.receipt.recovered), ["UNCERTAINTY", "JOURNAL_OBSERVATION", "MEMORY", "BEAR_PASS"]);
  assert.equal(r.receipt.recovered.MEMORY, "First birth: constitution bound, genesis written, day0 stages walked.");
  rmSync(dir, { recursive: true, force: true });
});

test("4. duplicate/missing required stage refuses", () => {
  const { dir, stores, log } = rig();
  const dup = LOG.replace("Genesis receipt written.\n", "Genesis receipt written.\n" + LOG.split("\n")[2] + "\n");
  const dupLog = join(dir, "dup.log"); writeFileSync(dupLog, dup);
  assert.throws(() => reconcile({ logPath: dupLog, storesDir: stores, apply: true }), ReconcileRefused);
  const miss = LOG.replace(/^\[turn 5 @ BEAR_PASS\].*\n(\[ok\].*\n)?/m, "");
  const missLog = join(dir, "miss.log"); writeFileSync(missLog, miss);
  assert.throws(() => reconcile({ logPath: missLog, storesDir: stores, apply: true }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("5. malformed JSON action refuses", () => {
  const { dir, stores, log } = rig();
  const bad = LOG.replace('{"tool":"memory_save","args":{"key":"day0","text":"First birth: constitution bound, genesis written, day0 stages walked."}}', "{not json");
  const badLog = join(dir, "bad.log"); writeFileSync(badLog, bad);
  assert.throws(() => reconcile({ logPath: badLog, storesDir: stores, apply: true }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("6. wrong historical empty-shell store refuses", () => {
  const { dir, stores, log } = rig();
  // decision non-empty => not an empty shell
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL.replace('"decision":""', '"decision":"real words"'));
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, apply: true }), ReconcileRefused);
  // missing one empty-shell record
  writeFileSync(join(stores, "journal.jsonl"), [GENESIS, emptyShell("uncertainty_recitation"), emptyShell("observation")].join("\n") + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, apply: true }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("7. non-empty memory refuses", () => {
  const { dir, stores, log } = rig();
  writeFileSync(join(stores, "memory.json"), JSON.stringify({ day0: { content: "real", provenance: "UNVERIFIED_WORKING_NOTE", ts: ORIG_MEM_TS } }, null, 2) + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, apply: true }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("8. duplicate reconciliation refuses", () => {
  const { dir, stores, log } = rig();
  reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true });
  const before = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("9. simulated journal-write failure rolls back both", () => {
  const { dir, stores, log } = rig();
  let jFails = true;
  const io = { write: (p, d) => { if (p.endsWith("journal.jsonl") && jFails) throw new Error("EIO journal"); writeFileSync(p, d); } };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true, io }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("10. simulated memory-write failure rolls back both", () => {
  const { dir, stores, log } = rig();
  let mFails = true;
  const io = { write: (p, d) => { if (p.endsWith("memory.json") && mFails) throw new Error("EIO memory"); writeFileSync(p, d); } };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true, io }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("11. apply preserves all original journal bytes as exact prefix", () => {
  const { dir, stores, log } = rig();
  reconcile({ logPath: log, storesDir: stores, now: NOW, apply: true });
  const after = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.ok(after.startsWith(EMPTY_JOURNAL)); // exact prefix
  assert.equal(after.slice(EMPTY_JOURNAL.length).split("\n").filter(l => l.trim()).length, 1); // exactly one appended line
  rmSync(dir, { recursive: true, force: true });
});
