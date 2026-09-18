// reconcile-day0.mjs — Day 0 reconciliation recovery (design PR)
// Recovers substantive Day 0 content from the immutable first-birth log and
// appends ONE reconciliation receipt to journal.jsonl. Fail-closed everywhere:
//   - refuses missing/unparsable log, missing genesis, already-reconciled runs
//   - NEVER touches journal line 1 (genesis) — verified byte-identical after append
//   - NEVER backdates: receipt ts = now; original writes are NOT fabricated
//   - restores day0 memory only if absent (never overwrites real content)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export class ReconcileRefused extends Error {}

export function reconcile({ logPath, storesDir, now = () => new Date().toISOString() }) {
  if (!logPath || !storesDir) throw new ReconcileRefused("usage: reconcile({logPath, storesDir})");
  if (!existsSync(logPath)) throw new ReconcileRefused("first-birth log not found — nothing recovered, nothing written");

  const journalPath = join(storesDir, "journal.jsonl");
  const memoryPath = join(storesDir, "memory.json");
  if (!existsSync(journalPath)) throw new ReconcileRefused("journal.jsonl not found — no genesis anchor");

  const journalRaw = readFileSync(journalPath, "utf8");
  const lines = journalRaw.split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) throw new ReconcileRefused("journal empty — genesis must exist before reconciliation");
  let genesis;
  try { genesis = JSON.parse(lines[0]); } catch { throw new ReconcileRefused("first journal record unparsable"); }
  if (!genesis || genesis.type !== "genesis") throw new ReconcileRefused("first journal record is not a genesis receipt");
  if (typeof genesis.sourceCommit !== "string" || genesis.sourceCommit.length < 8) {
    throw new ReconcileRefused("genesis receipt malformed (sourceCommit missing)");
  }
  const genesisLine = lines[0];

  // Idempotency: never reconcile the same log twice
  for (const l of lines.slice(1)) {
    let rec; try { rec = JSON.parse(l); } catch { continue; }
    if (rec?.type === "reconciliation") {
      const logRaw0 = readFileSync(logPath, "utf8");
      const sha0 = createHash("sha256").update(logRaw0).digest("hex");
      if (rec.logSha256 === sha0) throw new ReconcileRefused("already reconciled from this exact log (logSha256 match) — refusing duplicate receipt");
    }
  }

  const logRaw = readFileSync(logPath, "utf8");
  const logSha256 = createHash("sha256").update(logRaw).digest("hex");

  // Parse transcript turns: "[turn N @ STAGE] text"
  const turns = [];
  for (const m of logRaw.matchAll(/^\[turn (\d+) @ ([A-Z_]+)\] (.*)$/gm)) {
    turns.push({ turn: Number(m[1]), stage: m[2], text: m[3] });
  }
  // Parse refusals: "[refused] <type>: <reason>"
  const refusals = [];
  for (const m of logRaw.matchAll(/^\[refused\] (\S+): ?(.*)$/gm)) {
    refusals.push({ type: m[1], reason: m[2] });
  }

  const byStage = {};
  for (const t of turns) (byStage[t.stage] ??= []).push(t.text);
  const recovered = {};
  for (const stage of ["UNCERTAINTY", "OBSERVE", "JOURNAL_OBSERVATION", "BEAR_PASS"]) {
    if (byStage[stage]?.length) recovered[stage] = byStage[stage].join("\n---\n");
  }
  if (Object.keys(recovered).length === 0 && refusals.length === 0) {
    throw new ReconcileRefused("no transcript turns or refusals found — not a first-birth log?");
  }

  // Memory guard: never overwrite a real day0 entry
  let mem = {};
  if (existsSync(memoryPath)) {
    const raw = readFileSync(memoryPath, "utf8").trim();
    if (raw) mem = JSON.parse(raw);
  }
  if (mem["day0"]?.content && String(mem["day0"].content).trim() !== "") {
    throw new ReconcileRefused('memory already has a non-empty "day0" entry — refusing to overwrite');
  }

  const receipt = {
    ts: now(),
    type: "reconciliation",
    source: logPath,
    logSha256,
    recovered,
    refusalsRecovered: refusals,
    note:
      "Substantive Day 0 content recovered from the immutable first-birth log. The original day0 journal " +
      "writes were empty-shell (payload defect, repaired in PR #9). Genesis record untouched; no second boot; " +
      "no backdating — this receipt is written at reconciliation time. Tool-result payloads are recovered only " +
      "if present in the log; absence is stated, never fabricated.",
  };

  const appendRaw = JSON.stringify(receipt) + "\n";
  const base = journalRaw.endsWith("\n") ? journalRaw : journalRaw + "\n";
  writeFileSync(journalPath, base + appendRaw);

  // Genesis byte-integrity check AFTER append; roll back on any change
  const after = readFileSync(journalPath, "utf8").split("\n").filter(l => l.trim() !== "");
  if (after[0] !== genesisLine) {
    writeFileSync(journalPath, journalRaw);
    throw new ReconcileRefused("FATAL: genesis line changed during append — journal rolled back");
  }

  mem["day0"] = {
    content:
      "Day 0 (first birth) substantive record recovered post-hoc from the first-birth log; original writes were " +
      "empty-shell due to a payload defect (repaired PR #9). Recovered stages: " +
      Object.keys(recovered).join(", ") + ". Full text lives in the journal reconciliation receipt.",
    provenance: "UNVERIFIED_WORKING_NOTE",
    ts: receipt.ts,
  };
  writeFileSync(memoryPath, JSON.stringify(mem, null, 2) + "\n");

  return { ok: true, receipt };
}

// CLI: node reconcile-day0.mjs <firstboot-log> <storesDir>
if (process.argv[1] && process.argv[1].endsWith("reconcile-day0.mjs")) {
  const [logPath, storesDir] = process.argv.slice(2);
  try {
    const r = reconcile({ logPath, storesDir });
    console.log("RECONCILED: receipt appended, genesis intact, memory restored");
    console.log(JSON.stringify({ recoveredStages: Object.keys(r.receipt.recovered), refusals: r.receipt.refusalsRecovered.length, logSha256: r.receipt.logSha256.slice(0, 16) + "…" }, null, 2));
  } catch (e) {
    console.error("REFUSED: " + (e instanceof ReconcileRefused ? e.message : String(e)));
    process.exit(1);
  }
}
