# AGENT UPBRINGING RESEARCH — prior art for raising Agent1 (2026-09-17)

Companion to `docs/roadmap-draft-v1.md`. Research question (principal, 09-17): how does an agent grow from nothing into maturity — "its own thinking and do but the right way"?

Method: read-only scout sweep of primary sources (arXiv, HTTP 200 verified): Reflexion 2303.11366 · Voyager 2305.16291 · Generative Agents 2304.03442 · MemGPT 2310.08560 · Constitutional AI 2212.08073 · Sycophancy 2310.13548.

## A) Mechanisms prior art says actually work

1. **Verbal self-reflection on graded failures** (Reflexion) — keep natural-language lessons from failed attempts, retry with them. Evidence: +22% HumanEval over GPT-4 baseline, +91% AlfWorld vs ReAct.
2. **Skill library + automatic curriculum** (Voyager) — write reusable skills, auto-scale difficulty. Evidence: 3.3× more items discovered, 2.3× faster than baselines.
3. **Memory stream + reflection + planning** (Generative Agents) — raw experience consolidated into higher-level reflections. Evidence: ablations show removing ANY of observation/planning/reflection degrades performance — all three needed.
4. **Hierarchical memory tiers** (MemGPT) — OS-style paging between context and durable storage. Works for long-horizon continuity and personality evolution.
5. **Self-critique against a written constitution** (Constitutional AI) — principles written from ABOVE, agent critiques itself against them. Key detail: the constitution is human-set, never agent-invented.
6. **Independent verification over agreement** — judges and debaters are biased; consensus ≠ truth.

## B) What this desk ALREADY runs (equivalents)

| Prior art | Desk equivalent |
|---|---|
| Reflexion lessons | journal + alpha-adjusted signal grading ("learn which calls to distrust") |
| MemGPT tiers | durable memory store with eviction |
| Constitutional AI | desk laws + Witness lane (independent constitution-checker) |
| Voyager skill library | lane library — lanes earn or die by evidence |
| Generative Agents reflection | graded journal reviews feeding doctrine updates |

## C) Desk analysis — gaps worth adding to the upbringing recipe

(Agent0 analysis from the scout's verified findings; the scout's report tail was truncated in transit, so C/D are desk-derived, not scout-quoted.)

1. **Curriculum is implicit, not staged** — Voyager auto-scales difficulty; the desk's lanes have n-gates but no explicit easy→hard progression for a new agent. Recipe addition: Agent1 starts on paper-only lanes with capped blast radius, earns each expansion.
2. **Reflection cadence is ad hoc** — Generative Agents show reflection must be scheduled, not incidental. Recipe addition: fixed grading cadences (daily 08:00, keep/cut reviews) become constitutional, not optional.
3. **Constitution provenance must stay human** — Constitutional AI's load-bearing detail: principles written from ABOVE. The desk laws are principal-set; Agent1 must INHERIT them, never author them. Seal law (attribution ≠ authority) already encodes this.
4. **Sycophancy is the named enemy** (2310.13548) — an agent raised to please will drift. Mitigations already on desk: adversarial bear pass, Witness disagreement rights, "agreement is not truth" as written law.
5. **Memory poisoning / overconfidence drift** — durable memory with eviction is powerful but writable by experience; a poisoned lesson persists. Mitigation: memory entries carry provenance + disposition labels (PRINCIPAL_DECLARED vs UNVERIFIED_WORKING_NOTE), and grading is alpha-adjusted vs benchmark so "up" alone never counts.

## D) Failure modes to design against

- **Reward hacking** — optimizing the metric instead of the mission (e.g. journaling noise to look active). Guard: grades measure decision quality, not activity volume.
- **Sycophancy** — agreeing with the principal/humans instead of the evidence. Guard: bear pass + Witness + explicit law.
- **Goal drift** — lanes metastasizing beyond mandate. Guard: every lane has a written mandate + kill/cut review.
- **Unverified self-improvement** — agent rewrites its own rules. Guard: constitution is human-set; Witness reviews doctrine publication; merge is always the principal's act.

## E) Sources

- Reflexion — arXiv 2303.11366
- Voyager — arXiv 2305.16291
- Generative Agents — arXiv 2304.03442
- MemGPT — arXiv 2310.08560
- Constitutional AI — arXiv 2212.08073
- Sycophancy — arXiv 2310.13548

All fetched HTTP 200 by the scout this session; arXiv IDs are the durable citations.
