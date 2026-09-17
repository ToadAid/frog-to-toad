# Agent1 — Day 0 launch

**Launch host: Dell/TNG, after PR merge.** The principal does not run this from a phone — launch day comes after merge.

1. Clone the repo on the launch host.
2. Configure the model — **your credential, never committed**:

   ```
   export AGENT1_MODEL_BASE_URL="https://YOUR-PROVIDER/v1/chat/completions"
   export AGENT1_MODEL_NAME="your-model-name"
   export AGENT1_MODEL_KEY="your-key"   # env only — NEVER in any file
   ```

   (or copy `config/model.example.json` → `config/model.json` with baseUrl+model only — the key stays in your env)

3. Run the baby:

   ```
   node agent1/runtime.mjs
   ```

   What happens: boot (constitution verify, fail-closed) → genesis receipt on first boot / resume after → the verified canonical constitution text is loaded into the model context → Day 0 state machine (code-enforced): uncertainty recitation → observation → journal #1 → first memory (stamped UNVERIFIED_WORKING_NOTE) → bear pass → **stop at the human authority boundary**.

4. Watch it live: `agent1/stores/journal.jsonl` (genesis → uncertainty → observation → bear_pass) and `agent1/stores/memory.json` (its first memory, provenance-stamped).

No desk secrets, no wallet, nothing from Agent0's runtime. The child starts from nothing, by design.
