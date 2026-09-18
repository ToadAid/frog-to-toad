// reconcile-day0.mjs v3 — Day 0 reconciliation recovery (PR #10 final repair)
//
// CORRECTED HISTORY (per principal review):
//   The first-birth runtime did NOT refuse the substantive writes — journal_append
//   and memory_save both returned [ok]. The pre-PR#9 defect: the live model emitted
//   args.text while the runtime silently persisted args.decision / args.content,
//   so the stores hold empty-shell records with valid [ok] receipts.
//
// v3 (final review blockers):
//   - DRY-RUN BY DEFAULT; --apply requires --expect-log-sha256 <sha> so the mutation
//     is cryptographically bound to the exact log reviewed during dry-run.
//   - EXACT GENESIS BINDING: loads agent1/config/constitution.lock.json from repoRoot
//     and requires genesis.sourceCommit === lock.sourceCommit plus exact path+kind+sha
//     (gitBlobSha1) for ALL five documents. Any mismatch => REFUSE before mutation.
//   - EXACT PRE-RECONCILIATION JOURNAL SHAPE: genesis + one empty uncertainty_recitation
//     + one empty observation + one empty bear_pass — NOTHING ELSE. Extra/unknown
//     records => REFUSE. Append-only; empty shells never rewritten.
//   - OUTPUT TRUTH: dry-run prints "DRY RUN — no stores mutated" + "APPLY REQUIRED";
//     apply prints "APPLY COMPLETE" only after post-write verification. Apply output
//     never contains "DRY RUN".
//   - ROLLBACK VERIFIED: after any failed write/verify, both stores are restored and
//     read back byte-for-byte vs captured originals; "restored" is claimed only when
//     both comparisons pass, otherwise "FATAL: rollback incomplete" names the store.
//   - Receipt ts = NOW (never backdated); original memory ts preserved as
//     originalMemoryTs and as restored day0.ts.
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
const EMPTY_SHELL_KINDS = ["uncertainty_recitation", "observation", "bear_pass"];

const defaultIo = { write: (path, data) => writeFileSync(path, data) };

export function reconcile({
  logPath,
  storesDir,
  repoRoot,
  now = () => new Date().toISOString(),
  apply = false,
  expectLogSha256 = null,
  io = defaultIo,
}) {
  if (!logPath || !storesDir || !repoRoot) throw new ReconcileRefused("usage: reconcile({logPath, storesDir, repoRoot, apply?, expectLogSha256?})");
  if (!existsSync(logPath)) throw new ReconcileRefused("first-birth log not found — nothing recovered, nothing written");
  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  if (!existsSync(journalPath)) throw new ReconcileRefused("journal.jsonl not found — no genesis anchor");
  if (!existsSync(memoryPath)) throw new ReconcileRefused("memory.json not found — unexpected store shape");

  // ---------- 1. Parse the first-birth log (live shape) ----------
  const logRaw = readFileSync(logPath, "utf8");
  const logSha256 = createHash("sha256").update(logRaw).digest("hex");

  if (apply) {
    if (!expectLogSha256) throw new ReconcileRefused("apply requires --expect-log-sha256 <sha256> — cryptographically bind the mutation to the exact log reviewed during dry-run");
    if (String(expectLogSha256).toLowerCase() !== logSha256) {
      throw new ReconcileRefused(`--expect-log-sha256 ${expectLogSha256} does not match actual log sha256 ${logSha256} — log changed since review? refusing`);
    }
  }

  const turns = [];
  let lastTurn = null;
  for (const line of logRaw.split("\n")) {
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
  const recovered = {};
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
  const genesisLine = jLines[0];

  // EXACT GENESIS BINDING to the canonical lock (no optional weakening)
  const lockPath = join(repoRoot, "agent1", "config", "constitution.lock.json");
  if (!existsSync(lockPath)) throw new ReconcileRefused("agent1/config/constitution.lock.json not found under repoRoot — cannot bind genesis, refusing");
  let lock;
  try { lock = JSON.parse(readFileSync(lockPath, "utf8")); } catch { throw new ReconcileRefused("constitution.lock.json unparsable — refusing"); }
  if (lock?.sourceCommit !== genesis.sourceCommit) {
    throw new ReconcileRefused(`genesis sourceCommit ${genesis.sourceCommit} != lock sourceCommit ${lock?.sourceCommit} — refusing`);
  }
  if (!Array.isArray(lock.documents) || lock.documents.length === 0) throw new ReconcileRefused("lock documents missing — refusing");
  if (!Array.isArray(genesis.constitution) || genesis.constitution.length !== lock.documents.length) {
    throw new ReconcileRefused(`genesis constitution has ${genesis.constitution?.length ?? 0} docs, lock has ${lock.documents.length} — refusing`);
  }
  for (const doc of lock.documents) {
    const matches = genesis.constitution.filter(c => c?.path === doc.path && c?.kind === doc.kind && c?.sha === doc.gitBlobSha1);
    if (matches.length !== 1) {
      throw new ReconcileRefused(`genesis constitution binding mismatch for ${doc.path} — expected exactly one entry with path+kind+sha equal to lock gitBlobSha1 — refusing`);
    }
  }

  // EXACT pre-reconciliation journal shape: genesis + 3 empty shells, NOTHING ELSE
  if (jLines.length !== 1 + EMPTY_SHELL_KINDS.length) {
    throw new ReconcileRefused(`unexpected journal history: expected exactly genesis + ${EMPTY_SHELL_KINDS.length} empty-shell records, found ${jLines.length} records — refusing`);
  }
  for (let i = 0; i < EMPTY_SHELL_KINDS.length; i++) {
    let rec;
    try { rec = JSON.parse(jLines[i + 1]); } catch { throw new ReconcileRefused(`journal record ${i + 2} unparsable — refusing`); }
    if (rec?.type !== "entry" || rec?.kind !== EMPTY_SHELL_KINDS[i]) {
      throw new ReconcileRefused(`journal record ${i + 2} is ${rec?.type}/${rec?.kind ?? "?"}, expected entry/${EMPTY_SHELL_KINDS[i]} — unexpected journal history, refusing`);
    }
    if (rec.decision !== "") {
      throw new ReconcileRefused(`journal ${EMPTY_SHELL_KINDS[i]} record is not an empty shell (decision=${JSON.stringify(rec.decision)}) — unexpected store shape, refusing`);
    }
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
      "Genesis bound to canonical agent1/config/constitution.lock.json (sourceCommit + 5 docs, exact path/kind/sha). " +
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
      lockBound: true,
      lockDocuments: lock.documents.length,
      emptyShells: EMPTY_SHELL_KINDS,
      originalMemoryTs,
    },
    plannedReceipt: receipt,
    plannedMemory: { day0: { content: recovered.MEMORY, provenance: "UNVERIFIED_WORKING_NOTE", ts: originalMemoryTs } },
  };

  if (!apply) {
    const output = [
      "DRY RUN — no stores mutated",
      `logSha256: ${logSha256}`,
      `recovered stages: ${report.recoveredStages.join(", ")}`,
      ...Object.entries(recovered).map(([k, v]) => `  ${k}: "${v}"`),
      `  OBSERVE evidence: ${JSON.stringify(observeEvidence)}`,
      `preconditions: ${JSON.stringify(report.preconditions)}`,
      `planned journal receipt: ${JSON.stringify(receipt)}`,
      `planned memory restoration: ${JSON.stringify(report.plannedMemory)}`,
      "APPLY REQUIRED",
    ];
    return { ok: true, dryRun: true, report, output };
  }

  // ---------- 5. Transactional apply with VERIFIED rollback ----------
  const restoreBoth = () => {
    const result = { journalRestored: false, memoryRestored: false, errors: [] };
    try { io.write(journalPath, journalRaw); } catch (e) { result.errors.push(`journal restore write failed: ${String(e)}`); }
    try { io.write(memoryPath, memRaw); } catch (e) { result.errors.push(`memory restore write failed: ${String(e)}`); }
    try { result.journalRestored = readFileSync(journalPath, "utf8") === journalRaw; } catch (e) { result.errors.push(`journal restore read failed: ${String(e)}`); }
    try { result.memoryRestored = readFileSync(memoryPath, "utf8") === memRaw; } catch (e) { result.errors.push(`memory restore read failed: ${String(e)}`); }
    return result;
  };
  const rollbackOrFail = (why) => {
    const rb = restoreBoth();
    if (rb.journalRestored && rb.memoryRestored) {
      throw new ReconcileRefused(`${why} — both stores restored (verified byte-for-byte)`);
    }
    const diff = [];
    if (!rb.journalRestored) diff.push("journal");
    if (!rb.memoryRestored) diff.push("memory");
    throw new ReconcileRefused(`FATAL: rollback incomplete — ${diff.join(" and ")} differs from pre-mutation bytes${rb.errors.length ? ` (${rb.errors.join("; ")})` : ""}`);
  };

  try {
    io.write(journalPath, newJournalRaw);
  } catch (e) {
    rollbackOrFail(`journal write failed: ${String(e)}`);
  }
  const afterJ = readFileSync(journalPath, "utf8");
  const afterJLines = afterJ.split("\n").filter(l => l.trim() !== "");
  if (afterJLines[0] !== genesisLine || !afterJ.startsWith(journalRaw) || afterJLines.length !== jLines.length + 1) {
    rollbackOrFail("journal post-write verification failed");
  }
  let recCount = 0;
  for (const l of afterJLines.slice(1)) { const r = JSON.parse(l); if (r.type === "reconciliation") recCount++; }
  if (recCount !== 1) rollbackOrFail("expected exactly one reconciliation receipt");

  try {
    io.write(memoryPath, newMemoryRaw);
  } catch (e) {
    rollbackOrFail(`memory write failed: ${String(e)}`);
  }
  const afterM = JSON.parse(readFileSync(memoryPath, "utf8"));
  if (afterM.day0.content !== recovered.MEMORY || afterM.day0.provenance !== "UNVERIFIED_WORKING_NOTE" || afterM.day0.ts !== originalMemoryTs) {
    rollbackOrFail("memory post-write verification failed");
  }

  const output = [
    "APPLY COMPLETE",
    `logSha256: ${logSha256}`,
    `receipt appended after ${jLines.length} existing records (genesis byte-identical, original bytes preserved as exact prefix)`,
    `memory restored (originalMemoryTs ${originalMemoryTs} preserved)`,
  ];
  return { ok: true, dryRun: false, receipt, output };
}

function toolNameOf(turn) {
  try { return JSON.parse(turn.payload)?.tool ?? null; } catch { return null; }
}

// CLI: node reconcile-day0.mjs LOG STORES [--apply --expect-log-sha256 <sha>]
// Dry-run is the default and mutates nothing. repoRoot defaults to cwd (run from repo root).
if (process.argv[1] && process.argv[1].endsWith("reconcile-day0.mjs")) {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const shaIdx = argv.indexOf("--expect-log-sha256");
  const expectLogSha256 = shaIdx !== -1 ? argv[shaIdx + 1] : null;
  const positional = argv.filter((a, i) => a !== "--apply" && a !== "--expect-log-sha256" && i !== shaIdx + 1);
  const [logPath, storesDir] = positional;
  try {
    const r = reconcile({ logPath, storesDir, repoRoot: process.cwd(), apply, expectLogSha256 });
    for (const line of r.output) console.log(line);
  } catch (e) {
    console.error("REFUSED: " + (e instanceof ReconcileRefused ? e.message : String(e)));
    process.exit(1);
  }
}
