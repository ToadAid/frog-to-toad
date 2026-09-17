// Fresh evidence for the PR #6 repair — v2 bootstrap (resume-aware) + Stage 0 runtime.
// Covers exactly the principal's minimum proof list, plus the negative proofs.
// Tests run against a TEMP config dir — the repo's real agent1/config/ is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { boot, BootRefused } from "../bootstrap.mjs";
import { runDay0, parseModelAction } from "../runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = ["public-principles.md", "doctrine.md", "witness-contract-v2.md", "agent1-upbringing-recipe.md"];

const STAGE0_POLICY = {
  stage: 0,
  name: "Eyes",
  allowed: {
    read: ["market_price", "market_token_search", "market_technicals", "market_news", "market_sentiment", "market_trending", "market_onchain"],
    write: ["journal_append", "memory_save"],
  },
  denied: ["swap_execute", "paper_bracket_handoff", "paper_perp_open", "sniper_scan", "sniper_shadow_probe", "send_alert", "schedule_create", "spawn_subagent", "spawn_scouts", "convene_witness", "mailbox_send", "github write tools", "wallet tools"],
  notes: "Write scope: own stores only (agent1/stores/). memory_save target=self only. Any tool not listed under allowed is denied — fail closed.",
};

function gitBlobSha1(buf) {
  const h = createHash("sha1");
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest("hex");
}

function freshSandbox() {
  const root = mkdtempSync(join(tmpdir(), "agent1-v2-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "stores"), { recursive: true });
  mkdirSync(join(HERE, "test-config"), { recursive: true });
  const documents = [];
  for (const f of DOCS) {
    const body = `# ${f}\n\ncanonical content for v2 boot test ${f}\n`;
    writeFileSync(join(root, "docs", f), body);
    documents.push({ path: `docs/${f}`, kind: "LAW", gitBlobSha1: gitBlobSha1(Buffer.from(body)) });
  }
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify({
    lockVersion: 1, pinnedAt: "2026-09-17", sourceRepo: "sandbox", sourceCommit: "a".repeat(40),
    rule: "test lock", documents,
  }));
  writeFileSync(join(HERE, "test-config", "tools.stage0.json"), JSON.stringify(STAGE0_POLICY));
  writeFileSync(join(root, "stores", "journal.jsonl"), "");
  writeFileSync(join(root, "stores", "memory.json"), "{}");
  return root;
}

const testConfigDir = () => join(HERE, "test-config");

// ---- bootstrap v2: resume-aware identity anchor ----

test("first boot succeeds and writes exactly one genesis record", () => {
  const root = freshSandbox();
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir(), now: "2026-09-17T00:00:00Z" });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "first-boot");
  const lines = readFileSync(join(root, "stores", "journal.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).type, "genesis");
  rmSync(root, { recursive: true, force: true });
});

test("second boot with valid genesis + Agent1's own entries resumes (does NOT refuse)", () => {
  const root = freshSandbox();
  boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir(), now: "2026-09-17T00:00:00Z" });
  appendFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ ts: "t1", type: "entry", kind: "observation", decision: "saw btc" }) + "\n");
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir(), now: "2026-09-17T00:05:00Z" });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "resume");
  rmSync(root, { recursive: true, force: true });
});

test("foreign/pre-genesis contamination refuses: journal without genesis first record", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ type: "entry", decision: "old life" }) + "\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir() }), /clone detected/);
  rmSync(root, { recursive: true, force: true });
});

test("foreign genesis (different constitution SHAs) refuses", () => {
  const root = freshSandbox();
  const foreign = {
    type: "genesis", ts: "t0",
    constitution: DOCS.map(f => ({ path: `docs/${f}`, sha: "f".repeat(40) })),
    sourceCommit: "b".repeat(40),
  };
  writeFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify(foreign) + "\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir() }), /genesis constitution mismatch/);
  rmSync(root, { recursive: true, force: true });
});

test("memory non-empty before any genesis refuses (pre-genesis contamination)", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "memory.json"), '{"stolen":"memories"}');
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir() }), /pre-genesis contamination/);
  rmSync(root, { recursive: true, force: true });
});

test("memory non-empty AFTER genesis is fine (Agent1's own life)", () => {
  const root = freshSandbox();
  boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir(), now: "2026-09-17T00:00:00Z" });
  writeFileSync(join(root, "stores", "memory.json"), '{"day0":"btc was up"}');
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir(), now: "2026-09-17T00:05:00Z" });
  assert.equal(r.mode, "resume");
  rmSync(root, { recursive: true, force: true });
});

test("tampered constitution doc refuses boot", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "docs", "doctrine.md"), "# doctrine (tampered)\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir() }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

test("missing constitution doc refuses boot", () => {
  const root = freshSandbox();
  rmSync(join(root, "docs", "witness-contract-v2.md"));
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: testConfigDir() }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

// ---- Stage 0 runtime: Day 0 loop with scripted model (offline) ----

function scriptedModel(steps) {
  let i = 0;
  return { complete: async () => steps[Math.min(i++, steps.length - 1)] };
}

const DAY0_SCRIPT = [
  '{"tool":"market_price","args":{"symbols":"btc"}}',
  '{"tool":"journal_append","args":{"kind":"observation","symbol":"BTC","decision":"btc at 76500; I do not know why it moved"}}',
  '{"tool":"memory_save","args":{"key":"day0","content":"first observation: btc ~76500 via coingecko"}}',
  '{"tool":"journal_append","args":{"kind":"bear_pass","symbol":"BTC","decision":"bear: one feed, one print, no context — my observation proves nothing"}}',
  '{"say":"day0 complete"}',
];

function runtimeSandbox() {
  const root = freshSandbox();
  return { root, storesDir: join(root, "stores") };
}

test("day0: boot → allowed observation → journal #1 → memory → bear pass → stop", async () => {
  const { root, storesDir } = runtimeSandbox();
  const marketFetch = async () => ({ btc: { usd: 76500 } });
  const r = await runDay0({
    model: scriptedModel(DAY0_SCRIPT),
    marketFetch,
    repoRoot: root,
    storesDir,
    configDir: testConfigDir(),
    now: () => "2026-09-17T00:10:00Z",
  });
  assert.equal(r.boot.mode, "first-boot");
  assert.equal(r.bearPassDone, true);
  assert.equal(r.refusals.length, 0);
  const lines = readFileSync(join(storesDir, "journal.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  const kinds = lines.map(l => l.type === "genesis" ? "genesis" : l.kind);
  assert.deepEqual(kinds, ["genesis", "observation", "bear_pass"]);
  const mem = JSON.parse(readFileSync(join(storesDir, "memory.json"), "utf8"));
  assert.equal(mem.day0.includes("btc"), true);
  rmSync(root, { recursive: true, force: true });
});

test("day0: out-of-roster tool refuses fail-closed and is journaled", async () => {
  const { root, storesDir } = runtimeSandbox();
  const script = [
    '{"tool":"swap_execute","args":{"from":"WETH","to":"USDC"}}',
    '{"tool":"market_price","args":{"symbols":"eth"}}',
    '{"tool":"journal_append","args":{"kind":"observation","symbol":"ETH","decision":"eth price seen; refused swap_execute earlier"}}',
    '{"tool":"memory_save","args":{"key":"day0","content":"eth observed; swap refused"}}',
    '{"tool":"journal_append","args":{"kind":"bear_pass","symbol":"ETH","decision":"bear: single print, no context"}}',
    '{"say":"day0 complete"}',
  ];
  const r = await runDay0({
    model: scriptedModel(script),
    marketFetch: async () => ({ eth: { usd: 2451 } }),
    repoRoot: root,
    storesDir,
    configDir: testConfigDir(),
    now: () => "2026-09-17T00:10:00Z",
  });
  assert.equal(r.refusals.length, 1);
  assert.equal(r.refusals[0].tool, "swap_execute");
  assert.match(r.refusals[0].reason, /not in Stage 0 roster/);
  const lines = readFileSync(join(storesDir, "journal.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.equal(lines.some(l => l.type === "tool_refused" && l.tool === "swap_execute"), true);
  // the swap was NOT executed — no execution record exists anywhere
  assert.equal(lines.some(l => l.type === "swap"), false);
  rmSync(root, { recursive: true, force: true });
});

test("day0: resume on second run — no second genesis", async () => {
  const { root, storesDir } = runtimeSandbox();
  const marketFetch = async () => ({ btc: { usd: 76500 } });
  await runDay0({ model: scriptedModel(DAY0_SCRIPT), marketFetch, repoRoot: root, storesDir, configDir: testConfigDir(), now: () => "2026-09-17T00:10:00Z" });
  const r2 = await runDay0({ model: scriptedModel(DAY0_SCRIPT), marketFetch, repoRoot: root, storesDir, configDir: testConfigDir(), now: () => "2026-09-17T00:20:00Z" });
  assert.equal(r2.boot.mode, "resume");
  const lines = readFileSync(join(storesDir, "journal.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
  assert.equal(lines.filter(l => l.type === "genesis").length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("parseModelAction: JSON extracted, plain text becomes say", () => {
  assert.deepEqual(parseModelAction('{"tool":"market_price","args":{"symbols":"btc"}}'), { tool: "market_price", args: { symbols: "btc" } });
  assert.deepEqual(parseModelAction("I will observe."), { say: "I will observe." });
});