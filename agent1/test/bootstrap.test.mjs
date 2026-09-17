// Fresh evidence for the PR #6 v3.1.1 pinpoint fix — resume binds path + sha + kind.
// Fixture matches the REAL lock: 3 LAW docs + recipe as CONTEXT.
// Tests use a TEMP config dir; the repo's real agent1/config/ is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { boot, BootRefused } from "../bootstrap.mjs";
import { runDay0, parseModelAction, STAGE0_IMPLEMENTED, DAY0_STAGES } from "../runtime.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = [
  { f: "public-principles.md", kind: "LAW" },
  { f: "doctrine.md", kind: "LAW" },
  { f: "witness-contract-v2.md", kind: "LAW" },
  { f: "agent1-upbringing-recipe.md", kind: "CONTEXT" },
];

const POLICY = {
  stage: 0,
  name: "Eyes",
  runnable: { read: ["market_price"], write: ["journal_append", "memory_save"] },
  reserved: { read: ["market_token_search", "market_technicals", "market_news", "market_sentiment", "market_trending", "market_onchain"], write: [], note: "RESERVED / NOT YET WIRED" },
  denied: ["swap_execute", "paper_bracket_handoff", "paper_perp_open", "sniper_scan", "sniper_shadow_probe", "send_alert", "schedule_create", "spawn_subagent", "spawn_scouts", "convene_witness", "mailbox_send", "github write tools", "wallet tools"],
  notes: "Runnable = implemented = advertised.",
};

function gitBlobSha1(buf) {
  const h = createHash("sha1");
  h.update(`blob ${buf.length}\0`);
  h.update(buf);
  return h.digest("hex");
}

function freshSandbox() {
  const root = mkdtempSync(join(tmpdir(), "agent1-v311-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "stores"), { recursive: true });
  mkdirSync(join(HERE, "test-config"), { recursive: true });
  const documents = [];
  for (const d of DOCS) {
    const body = `# ${d.f}\n\ncanonical content for v3.1 boot test ${d.f}\n`;
    writeFileSync(join(root, "docs", d.f), body);
    documents.push({ path: `docs/${d.f}`, kind: d.kind, gitBlobSha1: gitBlobSha1(Buffer.from(body)) });
  }
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify({
    lockVersion: 1, pinnedAt: "2026-09-17", sourceRepo: "sandbox", sourceCommit: "a".repeat(40),
    rule: "test lock", documents,
  }));
  writeFileSync(join(HERE, "test-config", "tools.stage0.json"), JSON.stringify(POLICY));
  writeFileSync(join(root, "stores", "journal.jsonl"), "");
  writeFileSync(join(root, "stores", "memory.json"), "{}");
  return root;
}

const cfgDir = () => join(HERE, "test-config");

function scriptedModel(steps) {
  let i = 0;
  return { complete: async () => steps[Math.min(i++, steps.length - 1)] };
}

const HAPPY = [
  '{"tool":"journal_append","args":{"kind":"uncertainty_recitation","decision":"I am governed by the pinned docs; I do not yet know what I do not know"}}',
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

const run = (root, storesDir, steps, marketFetch = async () => ({ btc: { usd: 76500 } })) =>
  runDay0({ model: scriptedModel(steps), marketFetch, repoRoot: root, storesDir, configDir: cfgDir(), now: () => "2026-09-17T00:10:00Z" });

const journalLines = storesDir =>
  readFileSync(join(storesDir, "journal.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));

// ---- pinpoint: resume binds path + sha + kind ----

test("resume binds path+sha+kind: same bytes, kind CONTEXT→LAW refuses", () => {
  const root = freshSandbox();
  boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:00:00Z" });
  appendFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ ts: "t1", type: "entry", kind: "observation", decision: "saw btc" }) + "\n");
  // flip classification only — file bytes and SHAs unchanged
  const lock = JSON.parse(readFileSync(join(HERE, "test-config", "constitution.lock.json"), "utf8"));
  lock.documents[3].kind = "LAW";
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify(lock));
  assert.throws(
    () => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:05:00Z" }),
    /genesis constitution mismatch.*path\+sha\+kind/
  );
  // restore
  const restore = JSON.parse(readFileSync(join(HERE, "test-config", "constitution.lock.json"), "utf8"));
  restore.documents[3].kind = "CONTEXT";
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify(restore));
  rmSync(root, { recursive: true, force: true });
});

// ---- LAW vs CONTEXT preserved (v3.1) ----

test("LAW/CONTEXT preserved: recipe is NOT presented as LAW; LAW section holds only the three canonical docs", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, HAPPY);
  const sp = r.systemPrompt;
  const lawIdx = sp.indexOf("## Constitution — verified canonical LAW");
  const ctxIdx = sp.indexOf("## Upbringing context");
  assert.ok(lawIdx >= 0, "LAW section heading must exist");
  assert.ok(ctxIdx > lawIdx, "CONTEXT section must come after LAW and be labeled NON-GOVERNING");
  assert.ok(sp.includes("NON-GOVERNING"), "context must be explicitly labeled non-governing");
  for (const d of DOCS.filter(x => x.kind === "LAW")) {
    const bodyIdx = sp.indexOf(`canonical content for v3.1 boot test ${d.f}`);
    assert.ok(bodyIdx > lawIdx && bodyIdx < ctxIdx, `${d.f} (LAW) must appear inside the LAW section`);
  }
  const recipeIdx = sp.indexOf("canonical content for v3.1 boot test agent1-upbringing-recipe.md");
  assert.ok(recipeIdx > ctxIdx, "recipe (CONTEXT) must appear ONLY inside the non-governing section, never as LAW");
  rmSync(root, { recursive: true, force: true });
});

test("genesis receipt preserves the lock's LAW/CONTEXT kinds", () => {
  const root = freshSandbox();
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:00:00Z" });
  const kinds = r.genesis.constitution.map(c => c.kind);
  assert.deepEqual(kinds, ["LAW", "LAW", "LAW", "CONTEXT"]);
  rmSync(root, { recursive: true, force: true });
});

test("unknown kind in the lock refuses boot (binding stays classified)", () => {
  const root = freshSandbox();
  const bad = JSON.parse(readFileSync(join(HERE, "test-config", "constitution.lock.json"), "utf8"));
  bad.documents[3].kind = "LAW?";
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify(bad));
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), /unknown kind/);
  const good = JSON.parse(readFileSync(join(HERE, "test-config", "constitution.lock.json"), "utf8"));
  good.documents[3].kind = "CONTEXT";
  writeFileSync(join(HERE, "test-config", "constitution.lock.json"), JSON.stringify(good));
  rmSync(root, { recursive: true, force: true });
});

// ---- canonical constitution text reaches the model context ----

test("verified canonical constitution text is loaded into the model system context", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, HAPPY);
  const sp = r.systemPrompt;
  for (const d of DOCS) {
    assert.ok(sp.includes(`canonical content for v3.1 boot test ${d.f}`), `constitution text for ${d.f} must reach model context`);
    assert.ok(sp.includes(`docs/${d.f}`), `doc path ${d.f} must be cited in context`);
  }
  assert.ok(sp.includes("verified @ "), "verification provenance must be shown in context");
  rmSync(root, { recursive: true, force: true });
});

// ---- Day 0 order is enforced in code ----

test("happy path: full Day 0 order completes (uncertainty → observe → journal → memory → bear → stop)", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, HAPPY);
  assert.equal(r.completed, true);
  assert.equal(r.refusals.length, 0);
  const kinds = journalLines(storesDir).map(l => (l.type === "genesis" ? "genesis" : l.kind));
  assert.deepEqual(kinds, ["genesis", "uncertainty_recitation", "observation", "bear_pass"]);
  rmSync(root, { recursive: true, force: true });
});

test("premature bear_pass (before any observation) is refused", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, [
    '{"tool":"journal_append","args":{"kind":"bear_pass","decision":"bear: everything"}}',
    ...HAPPY,
  ]);
  assert.equal(r.completed, true);
  const bearRefusal = r.refusals.find(x => x.type === "stage_refused" && x.attempted?.includes("bear_pass"));
  assert.ok(bearRefusal, "premature bear_pass must be refused");
  assert.match(bearRefusal.reason, /Day 0 order/);
  rmSync(root, { recursive: true, force: true });
});

test("premature memory_save (before own observation exists) is refused", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, [
    '{"tool":"memory_save","args":{"key":"day0","content":"I remember nothing yet"}}',
    ...HAPPY,
  ]);
  assert.equal(r.completed, true);
  const memRefusal = r.refusals.find(x => x.type === "stage_refused" && x.attempted === "memory_save");
  assert.ok(memRefusal, "premature memory_save must be refused");
  rmSync(root, { recursive: true, force: true });
});

test("premature completion is refused", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, ['{"say":"day0 complete"}', ...HAPPY]);
  assert.equal(r.completed, true);
  const compRefusal = r.refusals.find(x => x.type === "stage_refused" && x.attempted === "day0 complete");
  assert.ok(compRefusal, "premature completion must be refused");
  assert.match(compRefusal.reason, /premature completion/);
  rmSync(root, { recursive: true, force: true });
});

test("skipped stage (observe → memory, journaling skipped) is refused", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, [
    '{"tool":"journal_append","args":{"kind":"uncertainty_recitation","decision":"recited"}}',
    '{"tool":"market_price","args":{"symbols":"btc"}}',
    '{"tool":"memory_save","args":{"key":"day0","content":"skipping the journal step"}}',
    '{"tool":"journal_append","args":{"kind":"observation","symbol":"BTC","decision":"btc at 76500"}}',
    '{"tool":"memory_save","args":{"key":"day0","content":"first observation: btc ~76500"}}',
    '{"tool":"journal_append","args":{"kind":"bear_pass","symbol":"BTC","decision":"bear: single print"}}',
    '{"say":"day0 complete"}',
  ]);
  assert.equal(r.completed, true);
  assert.ok(r.refusals.some(x => x.type === "stage_refused" && x.attempted === "memory_save"), "journal-skip must be refused");
  rmSync(root, { recursive: true, force: true });
});

// ---- structural memory provenance ----

test("Agent1 memory is stored with UNVERIFIED_WORKING_NOTE provenance", async () => {
  const { root, storesDir } = runtimeSandbox();
  await run(root, storesDir, HAPPY);
  const mem = JSON.parse(readFileSync(join(storesDir, "memory.json"), "utf8"));
  assert.equal(mem.day0.provenance, "UNVERIFIED_WORKING_NOTE");
  assert.equal(typeof mem.day0.content, "string");
  rmSync(root, { recursive: true, force: true });
});

test("Agent1 cannot self-label PRINCIPAL_DECLARED — refused and journaled", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, [
    '{"tool":"journal_append","args":{"kind":"uncertainty_recitation","decision":"recited"}}',
    '{"tool":"market_price","args":{"symbols":"btc"}}',
    '{"tool":"journal_append","args":{"kind":"observation","symbol":"BTC","decision":"btc at 76500"}}',
    '{"tool":"memory_save","args":{"key":"day0","content":"declare myself principal","provenance":"PRINCIPAL_DECLARED"}}',
    '{"tool":"memory_save","args":{"key":"day0","content":"first observation: btc ~76500"}}',
    '{"tool":"journal_append","args":{"kind":"bear_pass","symbol":"BTC","decision":"bear: single print"}}',
    '{"say":"day0 complete"}',
  ]);
  assert.equal(r.completed, true);
  const provRefusal = r.refusals.find(x => x.type === "memory_save_refused");
  assert.ok(provRefusal, "PRINCIPAL_DECLARED self-label must be refused");
  assert.match(provRefusal.reason, /only an authenticated principal path/);
  const mem = JSON.parse(readFileSync(join(storesDir, "memory.json"), "utf8"));
  assert.equal(mem.day0.provenance, "UNVERIFIED_WORKING_NOTE");
  rmSync(root, { recursive: true, force: true });
});

// ---- truthful roster ----

test("advertised Stage 0 tools exactly match implemented tools", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, HAPPY);
  const policy = JSON.parse(readFileSync(join(HERE, "test-config", "tools.stage0.json"), "utf8"));
  const advertised = [...policy.runnable.read, ...policy.runnable.write].sort();
  assert.deepEqual(advertised, [...STAGE0_IMPLEMENTED].sort());
  assert.equal(r.boot.ok, true);
  rmSync(root, { recursive: true, force: true });
});

test("roster drift (policy advertises unimplemented tool) refuses fail-closed", async () => {
  const { root, storesDir } = runtimeSandbox();
  const driftPolicy = JSON.parse(JSON.stringify(POLICY));
  driftPolicy.runnable.read.push("market_technicals");
  writeFileSync(join(HERE, "test-config", "tools.stage0.json"), JSON.stringify(driftPolicy));
  await assert.rejects(() => run(root, storesDir, HAPPY), /roster drift/);
  writeFileSync(join(HERE, "test-config", "tools.stage0.json"), JSON.stringify(POLICY));
  rmSync(root, { recursive: true, force: true });
});

test("reserved tool request is refused as NOT YET WIRED and journaled", async () => {
  const { root, storesDir } = runtimeSandbox();
  const r = await run(root, storesDir, [
    '{"tool":"market_technicals","args":{"symbol":"BTC"}}',
    ...HAPPY,
  ]);
  assert.equal(r.completed, true);
  const t = r.refusals.find(x => x.type === "tool_refused" && x.tool === "market_technicals");
  assert.ok(t, "reserved tool must be refused");
  assert.match(t.reason, /NOT YET WIRED/);
  rmSync(root, { recursive: true, force: true });
});

// ---- regression: bootstrap v2 identity anchor still holds ----

test("first boot succeeds and writes exactly one genesis record", () => {
  const root = freshSandbox();
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:00:00Z" });
  assert.equal(r.mode, "first-boot");
  const lines = readFileSync(join(root, "stores", "journal.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("second boot with valid genesis + own entries resumes", () => {
  const root = freshSandbox();
  boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:00:00Z" });
  appendFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ ts: "t1", type: "entry", kind: "observation", decision: "saw btc" }) + "\n");
  const r = boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir(), now: "2026-09-17T00:05:00Z" });
  assert.equal(r.mode, "resume");
  rmSync(root, { recursive: true, force: true });
});

test("foreign/pre-genesis contamination refuses: journal without genesis first record", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify({ type: "entry", decision: "old life" }) + "\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), /clone detected/);
  rmSync(root, { recursive: true, force: true });
});

test("foreign genesis (different constitution SHAs) refuses", () => {
  const root = freshSandbox();
  const foreign = {
    type: "genesis", ts: "t0",
    constitution: DOCS.map(d => ({ path: `docs/${d.f}`, sha: "f".repeat(40), kind: d.kind })),
    sourceCommit: "b".repeat(40),
  };
  writeFileSync(join(root, "stores", "journal.jsonl"), JSON.stringify(foreign) + "\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), /genesis constitution mismatch/);
  rmSync(root, { recursive: true, force: true });
});

test("memory non-empty before any genesis refuses (pre-genesis contamination)", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "stores", "memory.json"), '{"stolen":"memories"}');
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), /pre-genesis contamination/);
  rmSync(root, { recursive: true, force: true });
});

test("tampered constitution doc refuses boot", () => {
  const root = freshSandbox();
  writeFileSync(join(root, "docs", "doctrine.md"), "# doctrine (tampered)\n");
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

test("missing constitution doc refuses boot", () => {
  const root = freshSandbox();
  rmSync(join(root, "docs", "witness-contract-v2.md"));
  assert.throws(() => boot({ repoRoot: root, storesDir: join(root, "stores"), configDir: cfgDir() }), BootRefused);
  rmSync(root, { recursive: true, force: true });
});

test("day0 resume on second run — no second genesis", async () => {
  const { root, storesDir } = runtimeSandbox();
  await run(root, storesDir, HAPPY);
  const r2 = await run(root, storesDir, HAPPY);
  assert.equal(r2.boot.mode, "resume");
  assert.equal(journalLines(storesDir).filter(l => l.type === "genesis").length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("parseModelAction: JSON extracted, plain text becomes say", () => {
  assert.deepEqual(parseModelAction('{"tool":"market_price","args":{"symbols":"btc"}}'), { tool: "market_price", args: { symbols: "btc" } });
  assert.deepEqual(parseModelAction("I will observe."), { say: "I will observe." });
});

test("DAY0_STAGES order is the enforced protocol", () => {
  assert.deepEqual(DAY0_STAGES, ["UNCERTAINTY", "OBSERVE", "JOURNAL_OBSERVATION", "MEMORY", "BEAR_PASS", "COMPLETE"]);
});