# Agent1 — Day 0 launch (principal's steps)

1. Clone the repo.
2. `node agent1/bootstrap.mjs` — verifies the constitution against pinned SHAs, refuses clones, writes the genesis receipt. Fails closed on: missing/tampered constitution docs, non-empty stores.
3. Provide your own LLM key in **your** environment — never committed, never in the repo.
4. Start the runtime with `agent1/agent.md` as system context and `agent1/config/tools.stage0.json` as the tool allowlist.

No desk secrets, no wallet, nothing from Agent0's runtime. The child starts from nothing, by design.
