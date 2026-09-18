// REAL-LOCK REGRESSION (PR #8) — binds the REAL repo artifacts, never fixtures.
// Background: PR #7's focused tests used synthetic docs + synthetic SHAs in temp
// fixtures. They proved bootstrap SEMANTICS but not that the real
// agent1/config/constitution.lock.json matches the real repo docs. First birth on
// merged main refused fail-closed: lock pinned lessons-learned a37c4106…, actual
// blob aabd1d9c…. This test binds the real root + real lock + temp empty stores so
// that drift between lock and repo can never merge again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { boot, BootRefused } from "../bootstrap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", ".."); // agent1/test/ → repo root
const REAL_CONFIG = join(HERE, "..", "config"); // agent1/config — the REAL lock, read-only

const REAL_LOCK = JSON.parse(readFileSync(join(REAL_CONFIG, "constitution.lock.json"), "utf8"));

function gitBlobSha1(buf) {
  const h = createHash("sha1");
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest("hex");
}

function tempStores() {
  const stores = mkdtempSync(join(tmpdir(), "agent1-real-lock-"));
  writeFileSync(join(stores, "journal.jsonl"), "");
  writeFileSync(join(stores, "memory.json"), "{}");
  return stores;
}

const bootReal = stores => ({ repoRoot: REPO_ROOT, storesDir: stores, configDir: REAL_CONFIG, now: "2026-09-18T00:00:00Z" });

test("REAL lock: every pinned doc exists in the repo and matches its pinned gitBlobSha1", () => {
  assert.ok(Array.isArray(REAL_LOCK.documents) && REAL_LOCK.documents.length === 5, "lock binds exactly 5 docs");
  for (const d of REAL_LOCK.documents) {
    const buf = readFileSync(join(REPO_ROOT, d.path)); // ENOENT fails the test
    assert.equal(
      gitBlobSha1(buf), d.gitBlobSha1,
      `real doc ${d.path} must byte-match its pinned gitBlobSha1 (this is the regression that fired on main)`
    );
  }
});

test("REAL lock + REAL docs boot first-boot against temp empty stores", () => {
  const stores = tempStores();
  const r = boot({ ...bootReal(stores) });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "first-boot");
  assert.equal(r.verified.length, 5);
  const lessons = r.verified.find(v => v.path === "docs/agent1-lessons-learned.md");
  assert.ok(lessons, "lessons-learned must verify against the REAL repo doc");
  assert.equal(lessons.kind, "CONTEXT");
  rmSync(stores, { recursive: true, force: true });
});

test("REAL lock refuses a tampered copy of the real lessons doc (per-doc fail-closed)", () => {
  const root = mkdtempSync(join(tmpdir(), "agent1-real-tamper-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  for (const d of REAL_LOCK.documents) {
    writeFileSync(join(root, d.path), readFileSync(join(REPO_ROOT, d.path)));
  }
  appendFileSync(join(root, "docs/agent1-lessons-learned.md"), "\n<!-- tampered after pin -->\n");
  const stores = tempStores();
  assert.throws(
    () => boot({ repoRoot: root, storesDir: stores, configDir: REAL_CONFIG, now: "2026-09-18T00:00:00Z" }),
    e => e instanceof BootRefused && /constitution mismatch: docs\/agent1-lessons-learned\.md/.test(e.message)
  );
  rmSync(root, { recursive: true, force: true });
  rmSync(stores, { recursive: true, force: true });
});
