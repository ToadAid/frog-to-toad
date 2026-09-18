// reconcile-day0.test.mjs v4 — tests for the Day 0 reconciliation final-final repair (PR #10).
// Fixtures reproduce the ACTUAL first-birth log shape: "[turn N @ STAGE] {json action}"
// + "[ok] tool → result" (zero refusals, matching the real birth). Historical stores
// reproduce the real empty-shell defect shape. Genesis fixtures bind to the CANONICAL
// lock (sourceCommit 7429d2709caa1de839168749e954d4a30662acaf + 5 docs, exact
// path/kind/gitBlobSha1 from agent1/config/constitution.lock.json @ main 8c79df75).
// NO real first-birth log is used (it lives on the principal machine).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { reconcile, ReconcileRefused, parseCli } from "../reconciliation/reconcile-day0.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "reconciliation", "reconcile-day0.mjs");

const SOURCE_COMMIT = "7429d2709caa1de839168749e954d4a30662acaf";
const GENESIS = JSON.stringify({
  type: "genesis",
  sourceCommit: SOURCE_COMMIT,
  constitution: [
    { path: "docs/public-principles.md", kind: "LAW", sha: "c5c2fdb2571400f7f5b6aca49172fa4dfd1c9e7b" },
    { path: "docs/doctrine.md", kind: "LAW", sha: "9355673dc7a71ee7a6f12fac97a3bae4cbb47af8" },
    { path: "docs/witness-contract-v2.md", kind: "LAW", sha: "7ce39ebfbdc09fd2f51bdfd2cbae8cca58ccd662" },
    { path: "docs/agent1-upbringing-recipe.md", kind: "CONTEXT", sha: "900de50c1f5ea59b080e59929f13609084651085" },
    { path: "docs/agent1-lessons-learned.md", kind: "CONTEXT", sha: "aabd1d9c4c8317a5951f2f6183bdfe4ddb0c2f82" },
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
const LOG_SHA = createHash("sha256").update(LOG).digest("hex");

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
  const dir = mkdtempSync(join(tmpdir(), "rec4-"));
  const stores = join(dir, "stores");
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "agent1", "config"), { recursive: true });
  writeFileSync(join(repo, "agent1", "config", "constitution.lock.json"), JSON.stringify({
    lockVersion: 1,
    sourceCommit: SOURCE_COMMIT,
    documents: [
      { path: "docs/public-principles.md", kind: "LAW", gitBlobSha1: "c5c2fdb2571400f7f5b6aca49172fa4dfd1c9e7b" },
      { path: "docs/doctrine.md", kind: "LAW", gitBlobSha1: "9355673dc7a71ee7a6f12fac97a3bae4cbb47af8" },
      { path: "docs/witness-contract-v2.md", kind: "LAW", gitBlobSha1: "7ce39ebfbdc09fd2f51bdfd2cbae8cca58ccd662" },
      { path: "docs/agent1-upbringing-recipe.md", kind: "CONTEXT", gitBlobSha1: "900de50c1f5ea59b080e59929f13609084651085" },
      { path: "docs/agent1-lessons-learned.md", kind: "CONTEXT", gitBlobSha1: "aabd1d9c4c8317a5951f2f6183bdfe4ddb0c2f82" },
    ],
  }, null, 2));
  mkdirSync(stores, { recursive: true });
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL);
  writeFileSync(join(stores, "memory.json"), EMPTY_MEMORY);
  const log = join(dir, "firstboot.log");
  writeFileSync(log, LOG);
  return { dir, stores, repo, log };
}
const NOW = () => "2026-09-18T23:59:00.000Z";

test("1. exact live-shape happy path (dry-run then apply)", () => {
  const { dir, stores, repo, log } = rig();
  const dry = reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: false });
  assert.equal(dry.dryRun, true);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL); // untouched
  const sha = dry.report.logSha256;
  const r = reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: sha });
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
  const { dir, stores, repo, log } = rig();
  reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: false });
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("3. exact semantic recovery including MEMORY", () => {
  const { dir, stores, repo, log } = rig();
  const r = reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA });
  assert.deepEqual(Object.keys(r.receipt.recovered), ["UNCERTAINTY", "JOURNAL_OBSERVATION", "MEMORY", "BEAR_PASS"]);
  assert.equal(r.receipt.recovered.MEMORY, "First birth: constitution bound, genesis written, day0 stages walked.");
  rmSync(dir, { recursive: true, force: true });
});

test("4. duplicate/missing required stage refuses (parser path, exact reason)", () => {
  const { dir, stores, repo, log } = rig();
  const dup = LOG.replace("Genesis receipt written.\n", "Genesis receipt written.\n" + LOG.split("\n")[2] + "\n");
  const dupLog = join(dir, "dup.log"); writeFileSync(dupLog, dup);
  const dupSha = createHash("sha256").update(dup).digest("hex");
  assert.throws(
    () => reconcile({ logPath: dupLog, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: dupSha }),
    /duplicate stage UNCERTAINTY/,
  );
  const miss = LOG.replace(/^\[turn 5 @ BEAR_PASS\].*\n(\[ok\].*\n)?/m, "");
  const missLog = join(dir, "miss.log"); writeFileSync(missLog, miss);
  const missSha = createHash("sha256").update(miss).digest("hex");
  assert.throws(
    () => reconcile({ logPath: missLog, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: missSha }),
    /missing required stage BEAR_PASS/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("5. malformed JSON action refuses (parser path, exact reason)", () => {
  const { dir, stores, repo, log } = rig();
  const bad = LOG.replace('{"tool":"memory_save","args":{"key":"day0","text":"First birth: constitution bound, genesis written, day0 stages walked."}}', "{not json");
  const badLog = join(dir, "bad.log"); writeFileSync(badLog, bad);
  const badSha = createHash("sha256").update(bad).digest("hex");
  assert.throws(
    () => reconcile({ logPath: badLog, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: badSha }),
    /payload is not valid JSON action/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("5b. wrong kind refuses explicitly (parser path, exact reason)", () => {
  const { dir, stores, repo, log } = rig();
  const wrongKind = LOG.replace('"kind":"uncertainty_recitation"', '"kind":"observation"');
  const wrongKindLog = join(dir, "wrongkind.log"); writeFileSync(wrongKindLog, wrongKind);
  const sha = createHash("sha256").update(wrongKind).digest("hex");
  assert.throws(
    () => reconcile({ logPath: wrongKindLog, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: sha }),
    /expected kind uncertainty_recitation, got observation/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("6. wrong historical empty-shell store refuses", () => {
  const { dir, stores, repo, log } = rig();
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL.replace('"decision":""', '"decision":"real words"'));
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  writeFileSync(join(stores, "journal.jsonl"), [GENESIS, emptyShell("uncertainty_recitation"), emptyShell("observation")].join("\n") + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  // extra unknown record => refuse (exact shape: nothing else tolerated)
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL + JSON.stringify({ ts: "x", type: "entry", kind: "observation", decision: "" }) + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("7. non-empty memory refuses", () => {
  const { dir, stores, repo, log } = rig();
  writeFileSync(join(stores, "memory.json"), JSON.stringify({ day0: { content: "real", provenance: "UNVERIFIED_WORKING_NOTE", ts: ORIG_MEM_TS } }, null, 2) + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("8. duplicate reconciliation refuses", () => {
  const { dir, stores, repo, log } = rig();
  reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA });
  const before = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("9. simulated journal-write failure rolls back both (verified)", () => {
  const { dir, stores, repo, log } = rig();
  const io = { write: (p, d) => { if (p.endsWith("journal.jsonl")) throw new Error("EIO journal"); writeFileSync(p, d); } };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("10. simulated memory-write failure rolls back both (verified)", () => {
  const { dir, stores, repo, log } = rig();
  const io = { write: (p, d) => { if (p.endsWith("memory.json")) throw new Error("EIO memory"); writeFileSync(p, d); } };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("11. apply preserves all original journal bytes as exact prefix", () => {
  const { dir, stores, repo, log } = rig();
  reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA });
  const after = readFileSync(join(stores, "journal.jsonl"), "utf8");
  assert.ok(after.startsWith(EMPTY_JOURNAL)); // exact prefix
  assert.equal(after.slice(EMPTY_JOURNAL.length).split("\n").filter(l => l.trim()).length, 1); // exactly one appended line
  rmSync(dir, { recursive: true, force: true });
});

test("12. apply output truth: never contains DRY RUN; APPLY COMPLETE only after verification", () => {
  const { dir, stores, repo, log } = rig();
  const dry = reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: false });
  assert.ok(dry.output.some(l => l.startsWith("DRY RUN")));
  assert.ok(dry.output.includes("APPLY REQUIRED"));
  const r = reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA });
  assert.ok(r.output[0].startsWith("APPLY COMPLETE"));
  assert.ok(!r.output.some(l => l.includes("DRY RUN")));
  rmSync(dir, { recursive: true, force: true });
});

test("13. failed rollback verification => FATAL, no false restored claim", () => {
  const { dir, stores, repo, log } = rig();
  let first = true;
  const io2 = {
    write: (p, d) => {
      if (first && p.endsWith("journal.jsonl")) { first = false; throw new Error("EIO journal"); }
      if (p.endsWith("journal.jsonl")) { writeFileSync(p, d + "CORRUPT\n"); return; } // sabotage restore
      writeFileSync(p, d);
    },
  };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io: io2 }), /FATAL: rollback incomplete — journal differs/);
  rmSync(dir, { recursive: true, force: true });
});

test("14. apply without --expect-log-sha256 refuses", () => {
  const { dir, stores, repo, log } = rig();
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("15. apply with wrong --expect-log-sha256 refuses", () => {
  const { dir, stores, repo, log } = rig();
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: "0".repeat(64) }), ReconcileRefused);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  rmSync(dir, { recursive: true, force: true });
});

test("16. genesis binding: wrong sourceCommit / wrong doc sha / missing lock all refuse", () => {
  const { dir, stores, repo, log } = rig();
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL.replace(SOURCE_COMMIT, "7429d2709caa1de839168749e954d4a30662acff"));
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL.replace("9355673dc7a71ee7a6f12fac97a3bae4cbb47af8", "9355673dc7a71ee7a6f12fac97a3bae4cbb47af9"));
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  rmSync(join(repo, "agent1", "config", "constitution.lock.json"));
  writeFileSync(join(stores, "journal.jsonl"), EMPTY_JOURNAL);
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), ReconcileRefused);
  rmSync(dir, { recursive: true, force: true });
});

test("17. genesis binding: wrong path AND wrong kind each refuse", () => {
  const { dir, stores, repo, log } = rig();
  // wrong path: the tool iterates LOCK documents, so the mismatch is reported for the
  // lock's docs/doctrine.md entry (genesis carries docs/wrong-path.md instead).
  const wrongPath = GENESIS.replace("docs/doctrine.md", "docs/wrong-path.md");
  writeFileSync(join(stores, "journal.jsonl"), [wrongPath, emptyShell("uncertainty_recitation"), emptyShell("observation"), emptyShell("bear_pass")].join("\n") + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), /binding mismatch for docs\/doctrine\.md/);
  // wrong kind on the same doc (path right, kind wrong)
  const wrongKind = GENESIS.replace('"path":"docs/doctrine.md","kind":"LAW"', '"path":"docs/doctrine.md","kind":"CONTEXT"');
  writeFileSync(join(stores, "journal.jsonl"), [wrongKind, emptyShell("uncertainty_recitation"), emptyShell("observation"), emptyShell("bear_pass")].join("\n") + "\n");
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, apply: true, expectLogSha256: LOG_SHA }), /binding mismatch for docs\/doctrine\.md/);
  rmSync(dir, { recursive: true, force: true });
});

// ---------- v4 blockers ----------

test("18. parseCli: dry-run LOG STORES parses; unknown flag refuses; missing sha value refuses; wrong positional count refuses", () => {
  const ok = parseCli(["log.txt", "stores"]);
  assert.deepEqual(ok, { apply: false, expectLogSha256: null, logPath: "log.txt", storesDir: "stores" });
  const applied = parseCli(["log.txt", "stores", "--apply", "--expect-log-sha256", "abc"]);
  assert.equal(applied.apply, true);
  assert.equal(applied.expectLogSha256, "abc");
  assert.throws(() => parseCli(["log.txt", "stores", "--wat"]), /unknown flag/);
  assert.throws(() => parseCli(["log.txt", "stores", "--apply", "--expect-log-sha256"]), /requires a value/);
  assert.throws(() => parseCli(["log.txt"]), /usage:/);
  assert.throws(() => parseCli(["log.txt", "stores", "extra"]), /usage:/);
});

test("19. CLI integration: dry-run via child_process — exit 0, DRY RUN/APPLY REQUIRED, stores byte-identical", () => {
  const { dir, stores, repo, log } = rig();
  const out = execFileSync(process.execPath, [TOOL, log, stores], { cwd: repo, encoding: "utf8" });
  assert.match(out, /DRY RUN — no stores mutated/);
  assert.match(out, /APPLY REQUIRED/);
  assert.match(out, new RegExp(LOG_SHA));
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("20. CLI integration: apply without sha refuses with exit 1", () => {
  const { dir, stores, repo, log } = rig();
  assert.throws(() => execFileSync(process.execPath, [TOOL, log, stores, "--apply"], { cwd: repo, encoding: "utf8" }), (e) => e.status === 1 && /REFUSED/.test(e.stderr));
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  rmSync(dir, { recursive: true, force: true });
});

test("21. CLI integration: unknown flag refuses with exit 1", () => {
  const { dir, stores, repo, log } = rig();
  assert.throws(() => execFileSync(process.execPath, [TOOL, log, stores, "--wat"], { cwd: repo, encoding: "utf8" }), (e) => e.status === 1 && /unknown flag/.test(e.stderr));
  rmSync(dir, { recursive: true, force: true });
});

test("22. CLI integration: full apply via child_process mutates exactly once", () => {
  const { dir, stores, repo, log } = rig();
  const out = execFileSync(process.execPath, [TOOL, log, stores, "--apply", "--expect-log-sha256", LOG_SHA], { cwd: repo, encoding: "utf8" });
  assert.match(out, /APPLY COMPLETE/);
  assert.doesNotMatch(out, /DRY RUN/);
  const jLines = readFileSync(join(stores, "journal.jsonl"), "utf8").split("\n").filter(l => l.trim());
  assert.equal(jLines.length, 5);
  const mem = JSON.parse(readFileSync(join(stores, "memory.json"), "utf8"));
  assert.equal(mem.day0.content, "First birth: constitution bound, genesis written, day0 stages walked.");
  rmSync(dir, { recursive: true, force: true });
});

test("23. journal post-write CORRUPT bytes => refuse + both stores restored byte-for-byte", () => {
  const { dir, stores, repo, log } = rig();
  let first = true;
  const io = {
    write: (p, d) => {
      if (first && p.endsWith("journal.jsonl")) { first = false; writeFileSync(p, d + "GARBAGE\n"); return; } // corrupt the mutation
      writeFileSync(p, d); // restore writes are clean
    },
  };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /journal post-write verification failed — both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("24. appended receipt unparsable => refuse + both stores restored byte-for-byte", () => {
  const { dir, stores, repo, log } = rig();
  let first = true;
  const io = {
    write: (p, d) => {
      if (first && p.endsWith("journal.jsonl")) {
        first = false;
        // corrupt ONLY the appended receipt line (last line), keep prefix intact
        const s = d.toString();
        const idx = s.lastIndexOf('{"ts":');
        writeFileSync(p, s.slice(0, idx) + "{corrupt receipt\n");
        return;
      }
      writeFileSync(p, d);
    },
  };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /appended receipt unparsable.*both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("25. memory post-write CORRUPT bytes => refuse + both stores restored byte-for-byte", () => {
  const { dir, stores, repo, log } = rig();
  let first = true;
  const io = {
    write: (p, d) => {
      if (first && p.endsWith("memory.json")) { first = false; writeFileSync(p, '{"day0":{"content":"WRONG","provenance":"UNVERIFIED_WORKING_NOTE","ts":"x"}}\n'); return; }
      writeFileSync(p, d);
    },
  };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /memory post-write verification failed — both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "journal.jsonl"), "utf8"), EMPTY_JOURNAL);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});

test("26. memory post-write unparsable JSON => verified rollback, no raw exception escapes", () => {
  const { dir, stores, repo, log } = rig();
  let first = true;
  const io = {
    write: (p, d) => {
      if (first && p.endsWith("memory.json")) { first = false; writeFileSync(p, "{not json"); return; }
      writeFileSync(p, d);
    },
  };
  assert.throws(() => reconcile({ logPath: log, storesDir: stores, repoRoot: repo, now: NOW, apply: true, expectLogSha256: LOG_SHA, io }), /memory post-write read\/parse failed.*both stores restored \(verified byte-for-byte\)/);
  assert.equal(readFileSync(join(stores, "memory.json"), "utf8"), EMPTY_MEMORY);
  rmSync(dir, { recursive: true, force: true });
});
