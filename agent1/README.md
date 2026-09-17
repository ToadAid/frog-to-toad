# Agent1 — Day 0 launch (principal's steps)

1. Clone the repo.
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

   What happens: boot (constitution verify, fail-closed) → genesis receipt on first boot / resume after → Day 0 loop: one observation → journal #1 → first memory → bear pass → **stop at the human authority boundary**.

4. Watch it live: `agent1/stores/journal.jsonl` (genesis → observation → bear_pass) and `agent1/stores/memory.json` (its first memory).

No desk secrets, no wallet, nothing from Agent0's runtime. The child starts from nothing, by design.
