# Day 0 Reconciliation — design (deferred from PR #9)

## What
Agent1's first birth (2026-09-18, genesis consumed) ran against the pre-PR#9 runtime,
whose `journal_append` payload contract refused every substantive Day 0 write. The
immutable first-birth log (`~/agent1-firstboot-20260918T172117Z.log`, on the principal
machine) still holds the full transcript: the uncertainty recitation, the observation,
the bear pass, and the refusal records. This design recovers that content — post-hoc,
honestly, without touching genesis.

## Why
The journal is Agent1's inheritance (the 09-14 recursion frame). Day 0 is its birth
record; right now the birth journal carries refusals where its first words should be.
Reconciliation restores the substance while preserving every fail-closed property the
genesis lane bought.

## How — `reconcile-day0.mjs`
- Input: the first-birth log path + Agent1's stores dir. **The log is supplied by the
  principal at run time; the script refuses to run without it.** Sandbox tests use
  synthetic fixtures only.
- Parses `[turn N @ STAGE] text` transcript lines and `[refused] …` records — the exact
  shapes runtime.mjs emits.
- Appends **ONE** receipt record to `journal.jsonl`:
  `{ts, type:"reconciliation", source, logSha256, recovered, refusalsRecovered, note}`.
  `ts` is reconciliation time — **never backdated**. The receipt never pretends the
  original writes had content; it says exactly that.
- Restores the `day0` memory entry in the runtime's exact `memory_save` shape
  (`{content, provenance:"UNVERIFIED_WORKING_NOTE", ts}`) — only if absent.

## Fail-closed guarantees
1. Genesis (journal line 1) is verified present and byte-identical after append; any
   change rolls the journal back and refuses.
2. Missing log / unparsable genesis / non-genesis first record → refuse, write nothing.
3. Idempotent: the same log (matched by sha256) can never produce a second receipt.
4. Never overwrites an existing non-empty `day0` memory entry.
5. No second boot, no genesis rewrite, no re-anchor. Bootstrap resume semantics are
   untouched (bootstrap validates only the first record; appended receipts are inert to it).

## Recovery scope (honest limits)
Recovered content = the model's own transcript text per stage + refusal records.
Tool-result payloads are recovered only if the log format carried them; absence is
stated in the receipt, never fabricated.

## Test
`agent1/test/reconcile-day0.test.mjs` — 6 synthetic-fixture tests: happy path
(receipt appended, genesis byte-identical, memory restored), idempotency, missing log,
non-genesis journal, garbage log, existing-day0-memory guard.

## Run (principal step)
```
node agent1/reconciliation/reconcile-day0.mjs ~/agent1-firstboot-20260918T172117Z.log <storesDir>
```
