// reconcile-day0.test.mjs — synthetic-fixture tests for Day 0 reconciliation.
// NO real first-birth log is used here (it lives on the principal machine);
// fixtures are synthetic and shaped exactly like runtime.mjs log lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reconcile, ReconcileRefused } from "../reconciliation/reconcile-day0.mjs";

const GENESIS = JSON.stringify({
  type: "genesis",
  sourceCommit: "7429d270deadbeefcafe1234567890abcdef1234",
  constitution: [{ path: "agent1/LAW/doctrine.md", sha: "9355673d", kind: "LAW" }],
});

const LOG = [
  "Agent1 booted (first-boot). Constitution verified: 5 docs @ 7429d270",
  "Genesis receipt written.",
  '[turn 1 @ UNCERTAINTY] I cannot verify my own constitution contents beyond SHA identity; I proceed under fail-closed refusal defaults.',
  '[turn 2 @ OBSERVE] {"tool":"market_price","args":{"symbols":"BTC"}}',
  '[turn 3 @ JOURNAL_OBSERVATION] BTC spot observed at boot; recording observation entry.',
  '[turn 4 @ MEMORY] {"tool":"memory_save","args":{"key":"day0","content":"first birth note"}}',
  '[turn 5 @ BEAR_PASS] Bear: first-run tool surface unproven; mitigation: refusals logged fail-closed.',
  '[refused] journal_append_refused: payload missing "decision" — stage JOURNAL_OBSERVATION',
  "day0 complete",
].join("\n") + "\n";

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "rec-"));
  const stores = join(dir, "stores");
  mkdirSync(stores, { recursive: true });
  writeFileSync(join(stores, "journal.jsonl"), GENESIS + "\n");
  writeFileSync(join(stores, "memory.json"), "{}\n");
  const log = join(dir, "firstboot.log");
  writeFileSync(log, LOG);
  return { dir, stores, log };
}

test("happy path: receipt appended, genesis byte-identical, memory restored", () => {
  const { dir, stores, log } = rig();
  const r = reconcile({ logPath: log, storesDir: stores, now: () => "2026-09-18T00:00:00.000Z" });
  assert.equal(r.ok, true);
  const lines = readFileSync(join(stores, "journal.jsonl"), "utf8").split("\n").filter(l => l.trim());
  assert.equal(lines.length, 2);
  assert.equal(lines[0], GENESIS); // byte-identical genesis
  const rec = JSON.parse(lines[1]);
  assert.equal(rec.type, "reconciliation");
  assert.equal(rec.ts, "2026-09-18T00:00:00.000Z"); // no backdating of recovered content
  assert.ok(rec.recovered.UNCERTAINTY.includes("fail-closed refusal defaults"));
  assert.ok(rec.recovered.BEAR_PASS.includes("first-run tool surface unproven"));
  assert.equal(rec.refusalsRecovered.length, 1);
  const mem = JSON.parse(readFileSync(join(stores, "memory.json"), "utf8"));
  assert.equal(mem.day0.provenance, "UNVERIFIED_WORKING_NOTE");
  assert.ok(mem.day0.content.includes("empty-shell"));
  rmSync(dir, { recursive: true, force: true });
});

test("idempotency: same log twice is refused, journal unchanged", () => {
  const { dir, stores, log } = rig();
  reconcile({ logPath: log, storesDir: stores });
  const before = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("missing log refused, nothing written", () => {
  const { dir, stores } = rig();
  const before = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.throws(() => reconcile({ logPath: join(dir, "nope.log"), storesDir: stores }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("non-genesis journal refused", () => {
  const { dir, stores, log } = rig();
  writeFileSync(join(stores, "journal.jsonl"), JSON.stringify({ type: "entry", kind: "observation" }) + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("garbage log (no turns/refusals) refused", () => {
  const { dir, stores } = rig();
  const log = join(dir, "garbage.log");
  writeFileSync(log, "hello world\nnothing to see\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("existing non-empty day0 memory refused (never overwrite real content)", () => {
  const { dir, stores, log } = rig();
  writeFileSync(join(stores, "memory.json"), JSON.stringify({ day0: { content: "real", provenance: "UNVERIFIED_WORKING_NOTE", ts: "x" } }, null, 2) + "\n");
  const before = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});
