// PR #7 repair — focused tests: lessons-learned bound into the constitution lock as CONTEXT.
// Fixture mirrors the REAL lock shape: 3 canonical LAW + recipe CONTEXT + lessons CONTEXT (5 docs).
// Tests use their OWN temp config dir (test-config-lessons) — zero interference with the
// main suite's test-config, and the repo's real agent1/config/ is never touched.
// Scope: bootstrap-level lock verification only (path + sha + kind binding, genesis
// preservation, tamper refusal). System-prompt rendering of CONTEXT docs is generic
// (proven for the recipe by bootstrap.test.mjs); lessons rides the same code path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { boot, BootRefused } from "../bootstrap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = join(HERE, "test-config-lessons");

// The exact 5-doc binding this PR ships (SHAs are the real reviewed artifacts).
const LOCK_DOCS = [
  { path: "docs/public-principles.md", kind: "LAW" },
  { path: "docs/doctrine.md", kind: "LAW" },
  { path: "docs/witness-contract-v2.md", kind: "LAW" },
  { path: "docs/agent1-upbringing-recipe.md", kind: "CONTEXT" },
  { path: "docs/agent1-lessons-learned.md", kind: "CONTEXT" },
];
const LESSONS = "docs/agent1-lessons-learned.md";
const CANONICAL_LAW = LOCK_DOCS.filter(d => d.kind === "LAW").map(d => d.path);

function gitBlobSha1(buf) {
  const h = createHash("sha1");
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest("hex");
}

function freshSandbox() {
  const root = mkdtempSync(join(tmpdir(), "agent1-lessons-bind-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "stores"), { recursive: true });
  mkdirSync(CFG, { recursive: true });
  const documents = [];
  for (const d of LOCK_DOCS) {
    const body = `# ${d.path}\n\ncanonical content for lessons-bind test ${d.path}\n`;
    writeFileSync(join(root, d.path), body);
    documents.push({ path: d.path, kind: d.kind, gitBlobSha1: gitBlobSha1(Buffer.from(body)) });
  }
  writeFileSync(join(CFG, "constitution.lock.json"), JSON.stringify({
    lockVersion: 1, pinnedAt: "2026-09-18", sourceRepo: "sandbox", sourceCommit: "b".repeat(40),
    rule: "test lock", documents,
  }));
  writeFileSync(join(root, "stores", "journal.jsonl"), "");
  writeFileSync(join(root, "stores", "memory.json"), "{}");
  return root;
}

const bootOpts = root => ({ repoRoot: root, storesDir: join(root, "stores"), configDir: CFG, now: "2026-09-18T00:00:00Z" });
const readLock = () => JSON.parse(readFileSync(join(CFG, "constitution.lock.json"), "utf8"));
const writeLock = lock => writeFileSync(join(CFG, "constitution.lock.json"), JSON.stringify(lock));

test("lessons-learned is verified by path + SHA + kind at boot and lands in the genesis receipt", () => {
  const root = freshSandbox();
  const r = boot({ ...bootOpts(root) });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "first-boot");
  const lessons = r.verified.find(v => v.path === LESSONS);
  assert.ok(lessons, "lessons-learned must be among the verified docs");
  assert.equal(lessons.kind, "CONTEXT");
  assert.equal(lessons.sha, gitBlobSha1(readFileSync(join(root, LESSONS))));
  const g = r.genesis.constitution.find(c => c.path === LESSONS);
  assert.ok(g, "genesis receipt must record lessons-learned");
  assert.equal(g.kind, "CONTEXT");
  assert.equal(g.sha, lessons.sha);
  rmSync(root, { recursive: true, force: true });
});

test("lessons-learned appears only as NON-GOVERNING CONTEXT and never under canonical LAW", () => {
  const root = freshSandbox();
  const lock = readLock();
  const lawPaths = lock.documents.filter(d => d.kind === "LAW").map(d => d.path).sort();
  assert.deepEqual(lawPaths, [...CANONICAL_LAW].sort(), "canonical LAW must remain exactly the three canonical docs");
  const lessonsEntry = lock.documents.find(d => d.path === LESSONS);
  assert.ok(lessonsEntry, "lessons-learned must be bound in the lock");
  assert.equal(lessonsEntry.kind, "CONTEXT", "lessons-learned must be classified CONTEXT (non-governing)");
  assert.equal(lock.documents.length, 5, "lock holds exactly 3 LAW + 2 CONTEXT");
  rmSync(root, { recursive: true, force: true });
});

test("modifying the lessons artifact causes boot refusal", () => {
  const root = freshSandbox();
  const lessonsPath = join(root, LESSONS);
  appendFileSync(lessonsPath, "\n<!-- tampered after pin -->\n");
  assert.throws(
    () => boot({ ...bootOpts(root) }),
    e => e instanceof BootRefused && /constitution mismatch: docs\/agent1-lessons-learned\.md/.test(e.message)
  );
  rmSync(root, { recursive: true, force: true });
});

test("changing lessons classification CONTEXT → LAW cannot silently resume", () => {
  const root = freshSandbox();
  boot({ ...bootOpts(root) });
  appendFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ ts: "t1", type: "entry", kind: "observation", decision: "saw btc" }) + "\n");
  const lock = readLock();
  lock.documents.find(d => d.path === LESSONS).kind = "LAW";
  writeLock(lock);
  assert.throws(
    () => boot({ ...bootOpts(root), now: "2026-09-18T00:05:00Z" }),
    e => e instanceof BootRefused && /genesis constitution mismatch.*path\+sha\+kind/.test(e.message)
  );
  rmSync(root, { recursive: true, force: true });
});

test("genesis receipt preserves kinds for all five docs (3 LAW + 2 CONTEXT)", () => {
  const root = freshSandbox();
  const r = boot({ ...bootOpts(root) });
  assert.deepEqual(
    r.genesis.constitution.map(c => [c.path, c.kind]),
    LOCK_DOCS.map(d => [d.path, d.kind])
  );
  rmSync(root, { recursive: true, force: true });
});
