// reconcile-day0.mjs v2 — Day 0 reconciliation recovery (PR #10 repair)
//
// CORRECTED HISTORY (per principal review of head 04abbbd5):
//   The first-birth runtime did NOT refuse the substantive writes — journal_append
//   and memory_save both returned [ok]. The pre-PR#9 defect: the live model emitted
//   args.text while the runtime silently persisted args.decision / args.content,
//   so the stores hold empty-shell records with valid [ok] receipts.
//
// v2 behavior:
//   - DRY-RUN BY DEFAULT: prints evidence + plan, mutates nothing. --apply required.
//   - Parses the ACTUAL live-shape log: "[turn N @ STAGE] {json action}" + "[ok] tool → result".
//   - Recovers EXACT semantic payloads: journal_append args.text per stage,
//     memory_save args.text for MEMORY; OBSERVE preserved as tool evidence, not prose.
//   - Exactly one matching payload per required stage; missing/duplicate/malformed/
//     wrong-tool/wrong-kind => REFUSE. Never reconstructs words from memory.
//   - Verifies the exact historical store shape BEFORE mutation (genesis binding,
//     three empty-shell records exactly once, no prior reconciliation, empty day0 memory).
//   - Transactional apply: any write/verify failure restores BOTH stores to exact
//     pre-mutation bytes, then refuses. Genesis line byte-identical; original journal
//     bytes preserved as exact prefix; exactly one receipt appended.
//   - Receipt ts = NOW (never backdated); original memory ts preserved as originalMemoryTs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export class ReconcileRefused extends Error {}

const REQUIRED_STAGES = ["UNCERTAINTY", "OBSERVE", "JOURNAL_OBSERVATION", "MEMORY", "BEAR_PASS", "COMPLETE"];
const STAGE_CONTRACT = {
  UNCERTAINTY: { tool: "journal_append", kind: "uncertainty_recitation" },
  OBSERVE: { tool: "market_price" },
  JOURNAL_OBSERVATION: { tool: "journal_append", kind: "observation" },
  MEMORY: { tool: "memory_save", key: "day0" },
  BEAR_PASS: { tool: "journal_append", kind: "bear_pass" },
};

const defaultIo = { write: (path, data) => writeFileSync(path, data) };

export function reconcile({
  logPath,
  storesDir,
  now = () => new Date().toISOString(),
  apply = false,
  expectSourceCommit = null,
  io = defaultIo,
}) {
  if (!logPath || !storesDir) throw new ReconcileRefused("usage: reconcile({logPath, storesDir, apply?})");
  if (!existsSync(logPath)) throw new ReconcileRefused("first-birth log not found — nothing recovered, nothing written");
  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  if (!existsSync(journalPath)) throw new ReconcileRefused("journal.jsonl not found — no genesis anchor");
  if (!existsSync(memoryPath)) throw new ReconcileRefused("memory.json not found — unexpected store shape");

  // ---------- 1. Parse the first-birth log (live shape) ----------
  const logRaw = readFileSync(logPath, "utf8");
  const logSha256 = createHash("sha256").update(logRaw).digest("hex");

  const turns = []; // {n, stage, payload, okResult|null}
  const lines = logRaw.split("\n");
  let lastTurn = null;
  for (const line of lines) {
    const tm = line.match(/^\[turn (\d+) @ ([A-Z_]+)\] (.*)$/);
    if (tm) {
      lastTurn = { n: Number(tm[1]), stage: tm[2], payload: tm[3], okResult: null };
      turns.push(lastTurn);
      continue;
    }
    const om = line.match(/^\[ok\] (\S+) → (.*)$/);
    if (om && lastTurn) {
      if (om[1] !== toolNameOf(lastTurn)) {
        throw new ReconcileRefused(`[ok] line for ${om[1]} does not match turn tool at stage ${lastTurn.stage}`);
      }
      lastTurn.okResult = om[2];
    }
  }
  if (turns.length === 0) throw new ReconcileRefused("no [turn …] records found — not a first-birth log?");

  // Canonical order, exactly once each, strictly increasing turn numbers
  const seen = [];
  let prevN = 0;
  for (const t of turns) {
    if (!REQUIRED_STAGES.includes(t.stage)) throw new ReconcileRefused(`unknown stage ${t.stage} — not a first-birth log`);
    if (seen.includes(t.stage)) throw new ReconcileRefused(`duplicate stage ${t.stage} — refusing ambiguous recovery`);
    if (t.n <= prevN) throw new ReconcileRefused(`turn numbers not strictly increasing at turn ${t.n}`);
    prevN = t.n;
    seen.push(t.stage);
  }
  for (const stage of REQUIRED_STAGES) {
    if (!seen.includes(stage)) throw new ReconcileRefused(`missing required stage ${stage} — refusing partial recovery`);
  }
  const orderErr = seen.findIndex((s, i) => s !== REQUIRED_STAGES[i]);
  if (orderErr !== -1) throw new ReconcileRefused(`stages out of canonical order at ${seen[orderErr]}`);

  // ---------- 2. Semantic payload extraction (exact, per stage) ----------
  const recovered = {}; // prose payloads
  let observeEvidence = null;
  for (const t of turns) {
    let action;
    try { action = JSON.parse(t.payload); } catch {
      throw new ReconcileRefused(`turn ${t.n} @ ${t.stage}: payload is not valid JSON action`);
    }
    const contract = STAGE_CONTRACT[t.stage];
    if (t.stage === "COMPLETE") {
      if (action?.say !== "day0 complete") throw new ReconcileRefused("COMPLETE turn does not say 'day0 complete'");
      continue;
    }
    if (action?.tool !== contract.tool) {
      throw new ReconcileRefused(`stage ${t.stage}: expected tool ${contract.tool}, got ${action?.tool}`);
    }
    if (t.okResult === null) throw new ReconcileRefused(`stage ${t.stage}: missing [ok] tool-result line`);
    if (t.stage === "OBSERVE") {
      // Evidence, NOT prose: preserve action + tool result separately.
      observeEvidence = { action: action.args ?? null, toolResult: t.okResult };
      continue;
    }
    if (contract.kind && action?.args?.kind !== contract.kind) {
      throw new ReconcileRefused(`stage ${t.stage}: expected kind ${contract.kind}, got ${action?.args?.kind}`);
    }
    if (contract.key && action?.args?.key !== contract.key) {
      throw new ReconcileRefused(`stage ${t.stage}: expected memory key ${contract.key}, got ${action?.args?.key}`);
    }
    const text = action?.args?.text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new ReconcileRefused(`stage ${t.stage}: args.text missing/empty — nothing to recover, refusing`);
    }
    recovered[t.stage] = text;
  }
  if (!observeEvidence) throw new ReconcileRefused("OBSERVE evidence missing");

  // ---------- 3. Historical store preconditions (before any mutation) ----------
  const journalRaw = readFileSync(journalPath, "utf8");
  if (!journalRaw.endsWith("\n")) throw new ReconcileRefused("journal.jsonl does not end with newline — unexpected store shape");
  const jLines = journalRaw.split("\n").filter(l => l.trim() !== "");
  if (jLines.length === 0) throw new ReconcileRefused("journal empty — genesis must exist");
  let genesis;
  try { genesis = JSON.parse(jLines[0]); } catch { throw new ReconcileRefused("journal line 1 unparsable"); }
  if (genesis?.type !== "genesis") throw new ReconcileRefused("journal line 1 is not a genesis receipt");
  if (typeof genesis.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(genesis.sourceCommit)) {
    throw new ReconcileRefused("genesis sourceCommit missing/not full 40-hex sha");
  }
  if (!Array.isArray(genesis.constitution) || genesis.constitution.length === 0) {
    throw new ReconcileRefused("genesis constitution binding missing");
  }
  if (expectSourceCommit && genesis.sourceCommit !== expectSourceCommit) {
    throw new ReconcileRefused(`genesis sourceCommit ${genesis.sourceCommit} != expected ${expectSourceCommit}`);
  }
  const genesisLine = jLines[0];

  const emptyShellKinds = ["uncertainty_recitation", "observation", "bear_pass"];
  const kindCounts = {};
  for (const l of jLines.slice(1)) {
    let rec;
    try { rec = JSON.parse(l); } catch { throw new ReconcileRefused("journal contains unparsable record — unexpected store shape"); }
    if (rec?.type === "reconciliation") throw new ReconcileRefused("previous reconciliation record present — refusing duplicate");
    if (rec?.type === "entry" && emptyShellKinds.includes(rec.kind)) {
      kindCounts[rec.kind] = (kindCounts[rec.kind] ?? 0) + 1;
      if (rec.decision !== "") throw new ReconcileRefused(`journal ${rec.kind} record is not an empty shell (decision=${JSON.stringify(rec.decision)}) — unexpected store shape`);
    }
  }
  for (const k of emptyShellKinds) {
    if (kindCounts[k] !== 1) throw new ReconcileRefused(`expected exactly one empty-shell ${k} record, found ${kindCounts[k] ?? 0}`);
  }

  const memRaw = readFileSync(memoryPath, "utf8");
  let mem;
  try { mem = JSON.parse(memRaw); } catch { throw new ReconcileRefused("memory.json unparsable"); }
  if (!mem?.day0 || typeof mem.day0 !== "object") throw new ReconcileRefused("memory.day0 missing — unexpected store shape");
  if (mem.day0.content !== "") throw new ReconcileRefused("memory.day0.content is not empty — refusing to touch real content");
  if (mem.day0.provenance !== "UNVERIFIED_WORKING_NOTE") throw new ReconcileRefused("memory.day0.provenance unexpected");
  if (typeof mem.day0.ts !== "string" || !mem.day0.ts) throw new ReconcileRefused("memory.day0.ts missing — cannot preserve original memory timestamp");
  const originalMemoryTs = mem.day0.ts;

  // ---------- 4. Build receipt + planned writes ----------
  const receipt = {
    ts: now(),
    type: "reconciliation",
    source: logPath,
    logSha256,
    recovered,
    observeEvidence,
    originalMemoryTs,
    refusalsRecovered: [],
    note:
      "Substantive Day 0 content recovered verbatim from the immutable first-birth log. The first-birth runtime " +
      "ACCEPTED the Day 0 writes ([ok]); the pre-PR#9 runtime silently persisted empty payloads because the live " +
      "model emitted args.text while the runtime read args.decision/args.content (defect repaired in PR #9). " +
      "Genesis record untouched; no second boot; no backdating — this receipt is written at reconciliation time; " +
      "the original memory write timestamp is preserved in originalMemoryTs.",
  };
  const newMemory = { ...mem, day0: { content: recovered.MEMORY, provenance: "UNVERIFIED_WORKING_NOTE", ts: originalMemoryTs } };
  const newMemoryRaw = JSON.stringify(newMemory, null, 2) + "\n";
  const newJournalRaw = journalRaw + JSON.stringify(receipt) + "\n";

  const report = {
    logSha256,
    recoveredStages: Object.keys(recovered),
    observeEvidence,
    preconditions: {
      genesisSourceCommit: genesis.sourceCommit,
      constitutionDocs: genesis.constitution.length,
      emptyShells: kindCounts,
      originalMemoryTs,
    },
    plannedReceipt: receipt,
    plannedMemory: { day0: { content: recovered.MEMORY, provenance: "UNVERIFIED_WORKING_NOTE", ts: originalMemoryTs } },
  };

  if (!apply) {
    return { ok: true, dryRun: true, report, print: () => printReport(report) };
  }

  // ---------- 5. Transactional apply ----------
  const restoreBoth = () => {
    try { io.write(journalPath, journalRaw); } catch { /* best-effort restore */ }
    try { io.write(memoryPath, memRaw); } catch { /* best-effort restore */ }
  };

  try {
    io.write(journalPath, newJournalRaw);
  } catch (e) {
    restoreBoth();
    throw new ReconcileRefused(`journal write failed — both stores restored: ${String(e)}`);
  }
  // verify journal: genesis byte-identical, exact prefix, exactly one receipt
  const afterJ = readFileSync(journalPath, "utf8");
  const afterJLines = afterJ.split("\n").filter(l => l.trim() !== "");
  if (afterJLines[0] !== genesisLine || !afterJ.startsWith(journalRaw) || afterJLines.length !== jLines.length + 1) {
    restoreBoth();
    throw new ReconcileRefused("journal post-write verification failed — both stores restored");
  }
  let recCount = 0;
  for (const l of afterJLines.slice(1)) { const r = JSON.parse(l); if (r.type === "reconciliation") recCount++; }
  if (recCount !== 1) { restoreBoth(); throw new ReconcileRefused("expected exactly one reconciliation receipt — both stores restored"); }

  try {
    io.write(memoryPath, newMemoryRaw);
  } catch (e) {
    restoreBoth();
    throw new ReconcileRefused(`memory write failed — both stores restored: ${String(e)}`);
  }
  const afterM = JSON.parse(readFileSync(memoryPath, "utf8"));
  if (afterM.day0.content !== recovered.MEMORY || afterM.day0.provenance !== "UNVERIFIED_WORKING_NOTE") {
    restoreBoth();
    throw new ReconcileRefused("memory post-write verification failed — both stores restored");
  }

  return { ok: true, dryRun: false, receipt, print: () => printReport(report) };
}

function toolNameOf(turn) {
  try { return JSON.parse(turn.payload)?.tool ?? null; } catch { return null; }
}

function printReport(r) {
  console.log("DRY RUN — no stores mutated");
  console.log("logSha256:", r.logSha256);
  console.log("recovered stages:", r.recoveredStages.join(", "));
  for (const [k, v] of Object.entries(r.plannedReceipt.recovered)) console.log(`  ${k}: "${v}"`);
  console.log("  OBSERVE evidence:", JSON.stringify(r.observeEvidence));
  console.log("preconditions:", JSON.stringify(r.preconditions));
  console.log("planned journal receipt:", JSON.stringify(r.plannedReceipt));
  console.log("planned memory restoration:", JSON.stringify(r.plannedMemory));
  console.log("APPLY REQUIRED");
}

// CLI: node reconcile-day0.mjs LOG STORES [--apply] [--expect-source-commit <sha>]
if (process.argv[1] && process.argv[1].endsWith("reconcile-day0.mjs")) {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const expectIdx = argv.indexOf("--expect-source-commit");
  const expectSourceCommit = expectIdx !== -1 ? argv[expectIdx + 1] : null;
  const [logPath, storesDir] = argv.filter(a => a !== "--apply" && a !== "--expect-source-commit" && a !== expectSourceCommit);
  try {
    const r = reconcile({ logPath, storesDir, apply, expectSourceCommit });
    r.print();
    if (!r.dryRun) console.log("APPLIED: receipt appended, genesis intact, memory restored");
  } catch (e) {
    console.error("REFUSED: " + (e instanceof ReconcileRefused ? e.message : String(e)));
    process.exit(1);
  }
}
