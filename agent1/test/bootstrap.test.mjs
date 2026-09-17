import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { boot, BootRefused } from "../bootstrap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(dirname(HERE), ".."); // real docs/ live at repo root

function freshSandbox() {
  const root = mkdtempSync(join(tmpdir(), "agent1-test-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "stores"), { recursive: true });
  for (const f of [
    "public-principles.md",
    "doctrine.md",
    "witness-contract-v2.md",
    "agent1-upbringing-recipe.md",
  ]) {
    copyFileSync(join(REPO, "docs", f), join(root, "docs", f));
  }
  writeFileSync(join(root, "stores", "journal.jsonl"), "");
  writeFileSync(join(root, "stores", "memory.json"), "{}");
  return root;
}

test("happy path: fresh stores + intact constitution boots and writes genesis", () => {
  const root = freshSandbox();
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), now: "2026-09-17T00:00:00Z" });
  assert.equal(r.ok, true);
  assert.equal(r.verified.length, 4);
  const entry = JSON.parse(readFileSync(join(root, "stores", "journal.jsonl"), "utf8").trim());
  assert.equal(entry.type, "genesis");
  assert.equal(entry.constitution.length, 4);
  rmSync(root, { recursive: true, force: true });
});

test("tampered constitution doc refuses boot", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "docs", "doctrine.md"), "# doctrine (tampered)\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores") }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

test("missing constitution doc refuses boot", () => {
  const root = freshSandbox();
  rmSync(join(root, "docs", "witness-contract-v2.md"));
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores") }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

test("non-empty journal is clone-detected and refuses", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "journal.jsonl"), '{"type":"old-life"}\n');
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores") }), /clone detected/);
  rmSync(root, { recursive: true, force: true });
});

test("non-empty memory is clone-detected and refuses", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "memory.json"), '{"stolen":"memories"}');
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores") }), /clone detected/);
  rmSync(root, { recursive: true, force: true });
});
