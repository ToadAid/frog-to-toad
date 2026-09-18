# Day 0 Reconciliation — v3 (PR #10 final repair, per principal reviews of 04abbbd5 / 199ef736)

## Corrected history
The first-birth runtime did **NOT** refuse the substantive Day 0 writes —
`journal_append` and `memory_save` both returned `[ok]`. The pre-PR#9 defect was
silent: the live model emitted `args.text`, while the runtime persisted
`args.decision` / `args.content` — so the stores hold **empty-shell records with
valid `[ok]` receipts**. The defect was repaired in PR #9. The immutable
first-birth log (`~/agent1-firstboot-20260918T172117Z.log`, principal machine)
still holds the full transcript with the exact semantic payloads.

## What v3 does
- **DRY-RUN BY DEFAULT.** `node agent1/reconciliation/reconcile-day0.mjs LOG STORES`
  mutates nothing: prints log SHA256, recovered stage inventory, historical-store
  precondition result, planned journal receipt, planned memory restoration, and
  `APPLY REQUIRED`.
- **Cryptographic apply binding.** Mutation requires explicit principal action with
  the exact reviewed log: `--apply --expect-log-sha256 <sha256-from-dry-run>`.
  A missing or mismatching sha refuses — the input log cannot change between
  review and mutation.
- **Exact genesis binding.** Loads `agent1/config/constitution.lock.json` from
  `repoRoot` and requires `genesis.sourceCommit === lock.sourceCommit`
  (`7429d2709caa1de839168749e954d4a30662acaf`) plus exact path + kind + sha
  (`gitBlobSha1`) for ALL five documents. Any mismatch ⇒ REFUSE before mutation.
  No optional weakening on the normal principal path.
- **Exact pre-reconciliation journal shape.** For this historical migration the
  journal must be exactly: genesis + one empty `uncertainty_recitation` + one empty
  `observation` + one empty `bear_pass` — NOTHING ELSE. Unknown/later entries ⇒
  REFUSE. Append-only; the empty-shell records are never rewritten.
- **Semantic recovery, exact.** UNCERTAINTY / JOURNAL_OBSERVATION / BEAR_PASS =
  `journal_append args.text`; MEMORY = `memory_save args.text`; OBSERVE is
  preserved as tool evidence (`market_price` action + tool result), never mistaken
  for prose. Exactly one matching payload per required stage — missing / duplicate /
  malformed / wrong-tool / wrong-kind ⇒ REFUSE. Words are never reconstructed from
  memory.
- **Output truth.** Dry-run prints `DRY RUN — no stores mutated` + `APPLY REQUIRED`.
  Apply prints `APPLY COMPLETE` only after post-write verification; apply output
  never contains "DRY RUN" (regression-tested).
- **Verified rollback.** Exact pre-mutation bytes of BOTH stores are captured. After
  any failed write/verify, both stores are restored and read back byte-for-byte;
  "both stores restored" is claimed only when both comparisons pass — otherwise
  `FATAL: rollback incomplete` names the differing store. Post-apply verification:
  genesis line byte-identical, all original journal bytes preserved as exact prefix,
  exactly one receipt appended, memory content equals the exact recovered birth text,
  provenance and original ts correct.
- **Timestamps honest.** Receipt `ts` = reconciliation time (never backdated); the
  original memory write timestamp (`2026-09-18T17:21:40.885Z`) is preserved as the
  restored `day0.ts` and echoed in the receipt as `originalMemoryTs`.

## Fail-closed guarantees
1. Dry-run default — no mutation without `--apply --expect-log-sha256`.
2. Genesis bound to the canonical lock (sourceCommit + 5 docs, exact path/kind/sha).
3. Exact journal shape (genesis + 3 empty shells, nothing else) — unexpected state ⇒
   write nothing.
4. Transactional apply with byte-verified rollback of BOTH stores; FATAL names the
   store when restoration cannot be proven.
5. Genesis byte-identical; original journal bytes preserved as exact prefix.
6. Idempotent: a second reconciliation on the same stores is refused.
7. Never overwrites real memory content; never fabricates or reconstructs text.

## Recovery scope (honest limits)
Recovered content = the exact `args.text` payloads from the log's JSON actions +
the OBSERVE tool evidence. Nothing else is inferred; absence ⇒ refusal, never
fabrication.

## Test
`agent1/test/reconcile-day0.test.mjs` — **17/17 pass** (synthetic fixtures in the
actual first-birth structural shape, zero refusals, genesis bound to the canonical
lock): live-shape happy path, dry-run non-mutation, exact semantic recovery
including MEMORY, duplicate/missing stage, malformed JSON, wrong empty-shell store
(incl. extra-record refusal), non-empty memory, duplicate reconciliation,
journal-write-failure verified rollback, memory-write-failure verified rollback,
exact-prefix preservation, apply-output truth (no "DRY RUN" after apply), failed
rollback ⇒ FATAL (no false restored claim), apply without/wrong
`--expect-log-sha256` refuses, genesis binding (wrong sourceCommit / wrong doc sha /
missing lock / wrong path or kind all refuse).

## Run (principal steps, after merge)
```
node agent1/reconciliation/reconcile-day0.mjs ~/agent1-firstboot-20260918T172117Z.log <storesDir>   # dry-run: evidence + plan, prints logSha256
node agent1/reconciliation/reconcile-day0.mjs ~/agent1-firstboot-20260918T172117Z.log <storesDir> --apply --expect-log-sha256 <sha-from-dry-run>   # explicit mutation
```
