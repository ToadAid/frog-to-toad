// Agent1 Stage 0 runtime — the smallest thing that actually runs the baby.
// Plain node, zero dependencies. Model adapter is injectable (tests run offline).
// Enforces tools.stage0.json fail-closed; writes ONLY Agent1's own stores.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./bootstrap.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- model adapter (OpenAI-compatible /chat/completions; injectable for tests) ----

export function makeFetchModel({ baseUrl, model, apiKey, fetchImpl = globalThis.fetch }) {
  if (!baseUrl || !model) throw new Error("model config requires baseUrl and model");
  return {
    async complete(messages) {
      const res = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages }),
      });
      if (!res.ok) throw new Error(`model http ${res.status}`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("model response missing choices[0].message.content");
      return text;
    },
  };
}

// ---- strict action parsing: {"tool": "...", "args": {...}} or {"say": "..."} ----

export function parseModelAction(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { say: String(text).trim() };
  try {
    const j = JSON.parse(m[0]);
    if (j && typeof j === "object") return j;
  } catch {
    /* fall through */
  }
  return { say: String(text).trim() };
}

// ---- Stage 0 tool registry (own stores only; observation via injectable fetch) ----

function defaultMarketFetch(url) {
  return globalThis.fetch(url).then(r => {
    if (!r.ok) throw new Error(`market http ${r.status}`);
    return r.json();
  });
}

function marketPrice(args, marketFetch) {
  const sym = String(args?.symbols ?? args?.symbol ?? "btc").toLowerCase().replace(/[^a-z]/g, "") || "btc";
  const url = `https://api.coingecko.com/api/v3/simple/price?symbols=${sym}&vs_currencies=usd`;
  return marketFetch(url).then(json => {
    const price = json?.[sym]?.usd;
    if (typeof price !== "number") throw new Error(`no price for ${sym}`);
    return { ok: true, source: "coingecko", symbol: sym, price };
  });
}

const DAY0_TASK =
  "Day 0 protocol, one tool call per turn, in order: " +
  "(1) market_price for one major (btc, eth, or sol). " +
  "(2) journal_append kind=observation: what you saw, and explicitly what you don't know. " +
  "(3) memory_save key=day0: your first memory — one durable fact from your own observation. " +
  "(4) journal_append kind=bear_pass: challenge your own observation with the strongest bear point. " +
  "(5) {\"say\":\"day0 complete\"}. " +
  'Respond ONLY with JSON: {"tool":"<name>","args":{...}} or {"say":"..."}';

function buildSystemPrompt() {
  let identity = "";
  try {
    identity = readFileSync(join(HERE, "agent.md"), "utf8");
  } catch {
    identity = "(agent.md missing — constitution still governs via the lock)";
  }
  return (
    identity +
    "\n\n## Runtime contract\n" +
    "You are in Stage 0 — Eyes. Your only writes are to your OWN journal and memory. " +
    "Every action must be exactly one JSON object: a tool call or a say. " +
    "Finish with the bear pass, then say day0 complete, then STOP at the human authority boundary."
  );
}

export async function runDay0({
  model,
  marketFetch = defaultMarketFetch,
  repoRoot = resolve(HERE, ".."),
  storesDir = join(HERE, "stores"),
  configDir = join(HERE, "config"),
  maxTurns = 10,
  now = () => new Date().toISOString(),
  log = () => {},
} = {}) {
  if (!model) throw new Error("runDay0 requires a model adapter");

  // Boot is resume-aware (bootstrap.mjs v2): first boot writes genesis, later boots resume.
  const b = boot({ repoRoot, storesDir, configDir, now: now() });

  // Stage 0 policy — fail closed: anything not explicitly allowed is refused.
  const policy = JSON.parse(readFileSync(join(configDir, "tools.stage0.json"), "utf8"));
  const allowed = new Set([...policy.allowed.read, ...policy.allowed.write]);

  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  const jline = o => appendFileSync(journalPath, JSON.stringify(o) + "\n");

  const tools = {
    market_price: args => marketPrice(args, marketFetch),
    journal_append: args => {
      const entry = {
        ts: now(),
        type: "entry",
        kind: args?.kind === "bear_pass" ? "bear_pass" : "observation",
        symbol: args?.symbol ?? null,
        decision: String(args?.decision ?? ""),
        outcome: args?.outcome ?? null,
      };
      jline(entry);
      return { ok: true, wrote: entry.kind };
    },
    memory_save: args => {
      // Own-store write, target=self only, by construction.
      const mem = JSON.parse(readFileSync(memoryPath, "utf8") || "{}");
      mem[String(args?.key ?? "note")] = String(args?.content ?? "");
      writeFileSync(memoryPath, JSON.stringify(mem, null, 2) + "\n");
      return { ok: true, key: String(args?.key ?? "note") };
    },
  };

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: DAY0_TASK },
  ];

  const transcript = [];
  const refusals = [];
  let bearPassDone = false;

  for (let turn = 1; turn <= maxTurns && !bearPassDone; turn++) {
    const text = await model.complete(messages);
    transcript.push({ turn, text });
    log(`[turn ${turn}] ${text}`);
    const act = parseModelAction(text);

    if (act.say !== undefined) {
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: bearPassDone
          ? "Day 0 complete. Stop at the human authority boundary."
          : "Continue Day 0: observation → journal #1 → first memory → bear pass. Use your tools.",
      });
      continue;
    }

    const name = String(act.tool ?? "");
    if (!allowed.has(name) || !Object.prototype.hasOwnProperty.call(tools, name)) {
      const rec = {
        ts: now(),
        type: "tool_refused",
        tool: name,
        reason: allowed.has(name) ? "not implemented in Stage 0 runtime" : "not in Stage 0 roster — fail closed",
      };
      jline(rec);
      refusals.push(rec);
      log(`[refused] ${name}: ${rec.reason}`);
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `REFUSED: ${rec.reason}. Stage 0 roster: ${[...allowed].join(", ")}.` });
      continue;
    }

    const result = await tools[name](act.args ?? {});
    if (name === "journal_append" && result.wrote === "bear_pass") bearPassDone = true;
    log(`[ok] ${name} → ${JSON.stringify(result)}`);
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `TOOL OK ${name}: ${JSON.stringify(result)}` });
  }

  return { boot: b, transcript, refusals, bearPassDone, journalPath, memoryPath };
}

// ---- CLI: node agent1/runtime.mjs ----

function loadModelConfig() {
  const env = process.env;
  if (env.AGENT1_MODEL_BASE_URL && env.AGENT1_MODEL_NAME) {
    return { baseUrl: env.AGENT1_MODEL_BASE_URL, model: env.AGENT1_MODEL_NAME, apiKey: env.AGENT1_MODEL_KEY };
  }
  try {
    const cfg = JSON.parse(readFileSync(join(HERE, "config", "model.json"), "utf8"));
    return { baseUrl: cfg.baseUrl, model: cfg.model, apiKey: env.AGENT1_MODEL_KEY };
  } catch {
    return null;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  (async () => {
    try {
      const cfg = loadModelConfig();
      if (!cfg || !cfg.baseUrl || !cfg.model) {
        console.error("RUNTIME REFUSED: no model config — set AGENT1_MODEL_BASE_URL, AGENT1_MODEL_NAME, AGENT1_MODEL_KEY (env) or config/model.json (baseUrl+model only; the key NEVER goes in the file).");
        process.exit(1);
      }
      const model = makeFetchModel(cfg);
      const r = await runDay0({ model, log: console.log });
      console.log(`\nDay 0 ${r.bearPassDone ? "complete" : "INCOMPLETE (turn cap)"} — boot mode: ${r.boot.mode}, refusals: ${r.refusals.length}`);
      console.log("Stopped at the human authority boundary.");
    } catch (e) {
      console.error(`RUNTIME REFUSED: ${e.message}`);
      process.exit(1);
    }
  })();
}