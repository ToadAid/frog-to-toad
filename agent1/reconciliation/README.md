# Day 0 Reconciliation — v2 (PR #10 repair, per principal review of 04abbbd5)

## Corrected history
The first-birth runtime did **NOT** refuse the substantive Day 0 writes —
`journal_append` and `memory_save` both returned `[ok]`. The pre-PR#9 defect was
silent: the live model emitted `args.text`, while the runtime persisted
`args.decision` / `args.content` — so the stores hold **empty-shell records with
valid `[ok]` receipts**. The defect was repaired in PR #9. The immutable
first-birth log (`~/agent1-firstboot-20260918T172117Z.log`, principal machine)
still holds the full transcript with the exact semantic payloads.

## What v2 does
- **DRY-RUN BY DEFAULT.** `node agent1/reconciliation/reconcile-day0.mjs LOG STORES`
  mutates nothing: prints log SHA256, recovered stage inventory, historical-store
  precondition result, planned journal receipt, planned memory restoration, and
  `APPLY REQUIRED`. Mutation needs explicit principal action: `--apply`.
- Parses the **actual live-shape log**: `[turn N @ STAGE] {json action}` +
  `[ok] tool → result`.
- Recovers **exactly**: UNCERTAINTY / JOURNAL_OBSERVATION / BEAR_PASS =
  `journal_append args.text`; MEMORY = `memory_save args.text`; OBSERVE is
  preserved as tool evidence (`market_price` action + tool result), never mistaken
  for prose. Exactly one matching payload per required stage — missing / duplicate /
  malformed / wrong-tool / wrong-kind ⇒ REFUSE. Words are never reconstructed from
  memory.
- **Verifies the exact historical store shape before mutation**: genesis line valid
  (full 40-hex sourceCommit + constitution binding, optional `--expect-source-commit`),
  the three empty-shell records (`uncertainty_recitation`, `observation`,
  `bear_pass` with `decision:""`) each exactly once, no previous reconciliation,
  `memory.day0` present with `content === ""` and
  `provenance === "UNVERIFIED_WORKING_NOTE"`. Unexpected state ⇒ refuse, write nothing.
- **Append-only**: the empty-shell records are never rewritten; one reconciliation
  receipt is appended after them.
- **Transactional apply**: exact pre-mutation bytes of BOTH stores captured; any
  write or post-write verification failure restores both stores byte-exact and
  refuses. Post-apply verification: genesis line byte-identical, all original
  journal bytes preserved as exact prefix, exactly one receipt appended, memory
  content equals the exact recovered birth text, provenance correct.
- **Timestamps honest**: receipt `ts` = reconciliation time (never backdated); the
  original memory write timestamp (`2026-09-18T17:21:40.885Z`) is preserved as the
  restored `day0.ts` and echoed in the receipt as `originalMemoryTs`.

## Fail-closed guarantees
1. Dry-run default — no mutation without `--apply`.
2. Store-shape preconditions (genesis binding, three empty shells exactly once, no
   prior reconciliation, empty day0 memory) — unexpected state ⇒ write nothing.
3. Transactional apply with byte-exact rollback of BOTH stores on any failure.
4. Genesis byte-identical; original journal bytes preserved as exact prefix.
5. Idempotent: a second reconciliation on the same stores is refused.
6. Never overwrites real memory content; never fabricates or reconstructs text.

## Recovery scope (honest limits)
Recovered content = the exact `args.text` payloads from the log's JSON actions +
the OBSERVE tool evidence. Nothing else is inferred; absence ⇒ refusal, never
fabrication.

## Test
`agent1/test/reconcile-day0.test.mjs` — **11/11 pass** (synthetic fixtures in the
actual first-birth structural shape; zero refusals in the fixture, matching the
real birth): live-shape happy path, dry-run non-mutation, exact semantic recovery
including MEMORY, duplicate/missing stage, malformed JSON, wrong empty-shell store,
non-empty memory, duplicate reconciliation, journal-write-failure rollback,
memory-write-failure rollback, exact-prefix preservation.

## Run (principal steps, after merge)
```
node agent1/reconciliation/reconcile-day0.mjs ~/agent1-firstboot-20260918T172117Z.log <storesDir>   # dry-run: evidence + plan only
node agent1/reconciliation/reconcile-day0.mjs ~/agent1-firstboot-20260918T172117Z.log <storesDir> --apply   # explicit mutation
```
