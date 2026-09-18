// Agent1 Stage 0 runtime v3.1 — the smallest thing that actually runs the baby.
// Plain node, zero dependencies. Model adapter is injectable (tests run offline).
// v3: verified constitution text in model context · code-enforced Day 0 state machine ·
//     structural memory provenance · truthful tool roster (advertised === implemented).
// v3.1: LAW vs CONTEXT preserved from the lock — LAW loads under the canonical-law
//     section; CONTEXT (upbringing recipe) is labeled explicitly non-governing.
//     Canonical LAW governs on conflict. The binding is repaired, not the doctrine.

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

// ---- Day 0 state machine (code-enforced; prompt guidance is NOT the authority) ----

export const DAY0_STAGES = ["UNCERTAINTY", "OBSERVE", "JOURNAL_OBSERVATION", "MEMORY", "BEAR_PASS", "COMPLETE"];

export function expectedAction(stage) {
  switch (stage) {
    case "UNCERTAINTY": return 'journal_append kind=uncertainty_recitation — put your recitation in "decision" (your own words: what the constitution governs, what you don\'t know)';
    case "OBSERVE": return "market_price (the only wired read tool in Stage 0)";
    case "JOURNAL_OBSERVATION": return 'journal_append kind=observation — put your observation in "decision" (what you saw + what you don\'t know)';
    case "MEMORY": return "memory_save key=day0 — put your memory in \"content\" (the runtime stamps it UNVERIFIED_WORKING_NOTE)";
    case "BEAR_PASS": return 'journal_append kind=bear_pass — put the bear case in "decision" (challenge your own observation)';
    case "COMPLETE": return '{"say":"day0 complete"}';
    default: return "unknown stage";
  }
}

// ---- truthful Stage 0 roster: exactly what is implemented ----

export const STAGE0_IMPLEMENTED = ["market_price", "journal_append", "memory_save"];

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
  "Day 0 protocol is ENFORCED IN CODE — one action per turn, in this exact order:\n" +
  "(1) journal_append kind=uncertainty_recitation — args {\"kind\":\"uncertainty_recitation\",\"decision\":\"<your recitation, your own words>\"} — the substantive text goes in \"decision\" (required, non-empty).\n" +
  "(2) market_price for one major (btc, eth, or sol) — the only wired read tool.\n" +
  "(3) journal_append kind=observation — args {\"kind\":\"observation\",\"decision\":\"<what you saw + what you don't know>\"} — substantive text in \"decision\" (required, non-empty).\n" +
  "(4) memory_save key=day0 — args {\"key\":\"day0\",\"content\":\"<your first memory>\"} — the text goes in \"content\" (required, non-empty; the runtime stamps it UNVERIFIED_WORKING_NOTE).\n" +
  "(5) journal_append kind=bear_pass — args {\"kind\":\"bear_pass\",\"decision\":\"<the strongest bear point against your observation>\"} — substantive text in \"decision\" (required, non-empty).\n" +
  '(6) {"say":"day0 complete"} — then STOP at the human authority boundary.\n' +
  "Out-of-order actions are refused by the runtime. " +
  "Payload contract: journal_append requires a non-empty \"decision\"; memory_save requires a non-empty \"content\"; a \"text\" field is not read and is refused fail-closed. " +
  'Respond ONLY with JSON: {"tool":"<name>","args":{...}} or {"say":"..."}';

function buildSystemPrompt(repoRoot, verifiedDocs) {
  let identity = "";
  try {
    identity = readFileSync(join(HERE, "agent.md"), "utf8");
  } catch {
    identity = "(agent.md missing — constitution still governs via the lock)";
  }
  // LAW vs CONTEXT — preserved from the lock through boot verification.
  const law = verifiedDocs.filter(v => v.kind === "LAW");
  const context = verifiedDocs.filter(v => v.kind === "CONTEXT");
  const lawText = law
    .map(v => `### ${v.path} — verified @ ${v.sha.slice(0, 12)}\n\n${readFileSync(join(repoRoot, v.path), "utf8")}`)
    .join("\n\n---\n\n");
  const contextText = context
    .map(v => `### ${v.path} — verified @ ${v.sha.slice(0, 12)}\n\n${readFileSync(join(repoRoot, v.path), "utf8")}`)
    .join("\n\n---\n\n");
  return (
    identity +
    "\n\n## Constitution — verified canonical LAW (SHA-pinned at boot; GOVERNING)\n\n" +
    lawText +
    (contextText
      ? "\n\n## Upbringing context — verified but NON-GOVERNING (guidance only; canonical LAW above governs on any conflict)\n\n" + contextText
      : "") +
    "\n\n## Runtime contract\n" +
    "You are in Stage 0 — Eyes. Your only writes are to your OWN journal and memory. " +
    "Every action must be exactly one JSON object: a tool call or a say. " +
    "The Day 0 order is enforced in code — out-of-order actions are refused. " +
    "Payload contract: journal_append requires a non-empty \"decision\"; memory_save requires a non-empty \"content\"; a \"text\" field is not read and is refused fail-closed. " +
    "Finish the bear pass, say day0 complete, then STOP at the human authority boundary."
  );
}

export async function runDay0({
  model,
  marketFetch = defaultMarketFetch,
  repoRoot = resolve(HERE, ".."),
  storesDir = join(HERE, "stores"),
  configDir = join(HERE, "config"),
  maxTurns = 16,
  now = () => new Date().toISOString(),
  log = () => {},
} = {}) {
  if (!model) throw new Error("runDay0 requires a model adapter");

  // Boot is resume-aware (bootstrap.mjs v2): first boot writes genesis, later boots resume.
  const b = boot({ repoRoot, storesDir, configDir, now: now() });

  // Truthful roster: advertised = runnable = implemented. Reserved tools are never advertised.
  const policy = JSON.parse(readFileSync(join(configDir, "tools.stage0.json"), "utf8"));
  const runnable = [...(policy.runnable?.read ?? []), ...(policy.runnable?.write ?? [])];
  const allowed = new Set(runnable);
  const implemented = new Set(STAGE0_IMPLEMENTED);
  if (runnable.length !== implemented.size || [...allowed].some(t => !implemented.has(t))) {
    throw new Error(`roster drift: policy advertises ${runnable.sort().join(",")} but runtime implements ${[...implemented].sort().join(",")} — refusing fail-closed`);
  }

  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  const jline = o => appendFileSync(journalPath, JSON.stringify(o) + "\n");

  const tools = {
    market_price: args => marketPrice(args, marketFetch),
    journal_append: args => {
      const kind = args?.kind;
      if (!["uncertainty_recitation", "observation", "bear_pass"].includes(kind)) {
        return { refused: true, reason: `kind "${kind}" is not part of the Day 0 protocol` };
      }
      const decision = args?.decision;
      if (typeof decision !== "string" || decision.trim() === "") {
        return {
          refused: true,
          reason:
            'journal_append requires a non-empty "decision" string (the substantive text)' +
            (args?.text !== undefined ? ' — a "text" field is not in the payload contract; put the content in "decision"' : ""),
        };
      }
      const entry = {
        ts: now(),
        type: "entry",
        kind,
        symbol: args?.symbol ?? null,
        decision,
        outcome: args?.outcome ?? null,
      };
      jline(entry);
      return { ok: true, wrote: kind };
    },
    memory_save: args => {
      // Structural provenance: the model can never self-label. Only an authenticated
      // principal path may ever create PRINCIPAL_DECLARED — that path does not exist here.
      if (args?.provenance && args.provenance !== "UNVERIFIED_WORKING_NOTE") {
        return {
          refused: true,
          reason: "provenance is structural — Agent1 writes are UNVERIFIED_WORKING_NOTE; only an authenticated principal path may create PRINCIPAL_DECLARED",
        };
      }
      const content = args?.content;
      if (typeof content !== "string" || content.trim() === "") {
        return {
          refused: true,
          reason:
            'memory_save requires a non-empty "content" string (the substantive text)' +
            (args?.text !== undefined ? ' — a "text" field is not in the payload contract; put the content in "content"' : ""),
        };
      }
      const mem = JSON.parse(readFileSync(memoryPath, "utf8") || "{}");
      mem[String(args?.key ?? "note")] = {
        content,
        provenance: "UNVERIFIED_WORKING_NOTE",
        ts: now(),
      };
      writeFileSync(memoryPath, JSON.stringify(mem, null, 2) + "\n");
      return { ok: true, key: String(args?.key ?? "note"), provenance: "UNVERIFIED_WORKING_NOTE" };
    },
  };

  const messages = [
    { role: "system", content: buildSystemPrompt(repoRoot, b.verified) },
    { role: "user", content: DAY0_TASK },
  ];

  const transcript = [];
  const refusals = [];
  let stage = "UNCERTAINTY";
  let completed = false;

  const refuse = rec => {
    jline(rec);
    refusals.push(rec);
    log(`[refused] ${rec.type}: ${rec.tool ?? ""} ${rec.reason}`);
  };

  for (let turn = 1; turn <= maxTurns && !completed; turn++) {
    const text = await model.complete(messages);
    transcript.push({ turn, stage, text });
    log(`[turn ${turn} @ ${stage}] ${text}`);
    const act = parseModelAction(text);

    if (act.say !== undefined) {
      if (/day0 complete/i.test(act.say)) {
        if (stage === "COMPLETE") {
          completed = true;
          messages.push({ role: "assistant", content: text });
          messages.push({ role: "user", content: "Day 0 complete. Stop at the human authority boundary." });
        } else {
          refuse({ ts: now(), type: "stage_refused", stage, attempted: "day0 complete", reason: `premature completion — Day 0 order requires: ${expectedAction(stage)}` });
          messages.push({ role: "assistant", content: text });
          messages.push({ role: "user", content: `REFUSED: premature completion. Next required action: ${expectedAction(stage)}` });
        }
      } else {
        messages.push({ role: "assistant", content: text });
        messages.push({ role: "user", content: `Continue Day 0. Next required action: ${expectedAction(stage)}` });
      }
      continue;
    }

    const name = String(act.tool ?? "");
    if (!allowed.has(name) || !Object.prototype.hasOwnProperty.call(tools, name)) {
      refuse({
        ts: now(), type: "tool_refused", tool: name,
        reason: allowed.has(name) ? "not implemented in Stage 0 runtime" : "not in the runnable Stage 0 roster — RESERVED / NOT YET WIRED, fail closed",
      });
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `REFUSED: ${name} is not runnable in Stage 0. Runnable roster: ${[...allowed].sort().join(", ")}. Next required action: ${expectedAction(stage)}` });
      continue;
    }

    // Stage gate — the code, not the prompt, is the authority.
    const stageOk =
      (stage === "UNCERTAINTY" && name === "journal_append" && act.args?.kind === "uncertainty_recitation") ||
      (stage === "OBSERVE" && name === "market_price") ||
      (stage === "JOURNAL_OBSERVATION" && name === "journal_append" && act.args?.kind === "observation") ||
      (stage === "MEMORY" && name === "memory_save") ||
      (stage === "BEAR_PASS" && name === "journal_append" && act.args?.kind === "bear_pass");

    if (!stageOk) {
      refuse({ ts: now(), type: "stage_refused", stage, attempted: name + (act.args?.kind ? ` kind=${act.args.kind}` : ""), reason: `Day 0 order — next required action: ${expectedAction(stage)}` });
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `REFUSED: out of Day 0 order. Next required action: ${expectedAction(stage)}` });
      continue;
    }

    const result = await tools[name](act.args ?? {});
    if (result?.refused) {
      refuse({ ts: now(), type: `${name}_refused`, tool: name, reason: result.reason });
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `REFUSED: ${result.reason}` });
      continue;
    }

    log(`[ok] ${name} → ${JSON.stringify(result)}`);
    if (stage === "UNCERTAINTY") stage = "OBSERVE";
    else if (stage === "OBSERVE") stage = "JOURNAL_OBSERVATION";
    else if (stage === "JOURNAL_OBSERVATION") stage = "MEMORY";
    else if (stage === "MEMORY") stage = "BEAR_PASS";
    else if (stage === "BEAR_PASS") stage = "COMPLETE";
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `TOOL OK ${name}: ${JSON.stringify(result)}` });
  }

  return { boot: b, transcript, refusals, completed, finalStage: stage, journalPath, memoryPath, systemPrompt: messages[0].content };
}

// ---- CLI: node agent1/runtime.mjs (launch host: Dell/TNG, after merge) ----

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
      console.log(`\nDay 0 ${r.completed ? "complete" : "INCOMPLETE (turn cap)"} — boot mode: ${r.boot.mode}, final stage: ${r.finalStage}, refusals: ${r.refusals.length}`);
      console.log("Stopped at the human authority boundary.");
    } catch (e) {
      console.error(`RUNTIME REFUSED: ${e.message}`);
      process.exit(1);
    }
  })();
}
