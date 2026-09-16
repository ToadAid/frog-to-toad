# Architecture Overview (Public)

The public shape of the Frog-to-Toad desk — what the pieces are and how authority flows. Deliberately provider-agnostic: the recipe is public, the specific deployment is private.

## The shape

One orchestrator agent coordinates a small set of specialist agents. Each has a narrow job and a narrower set of tools:

- **Orchestrator** — single point of contact for the principal. Routes research, weighs evidence, journals decisions. Holds no execution tools.
- **Researcher** — market research: prices, trends, onchain flows. Read-only.
- **Token auditor** — security screening of tokens before any trade: liquidity, ownership, taxes, honeypot checks. Read-only.
- **Risk guardian** — adversarial reviewer. Argues the bear case against every proposed trade. Can veto.
- **Executor** — the only agent with swap/execution tools. In paper mode it runs simulated trades; in live mode every action requires explicit human approval through an external signer.
- **Witness** — independent read-only reviewer for doctrine and conformance claims. Reviews artifacts blind; its agreement is never proof or authority.

## Authority flow

Research and evidence are read-only. Execution is isolated in one agent, behind an external signer, behind per-action human approval. The orchestrator can propose; only the human can permit. Guards in code refuse out-of-bounds actions, and refusals are reported, not worked around.

## Evidence lanes

Capabilities are proven on paper before they touch anything real:

- **Paper trading ledgers** — simulated positions held to the same discipline as live ones: entries need theses, bear cases, and invalidation levels; exits are journaled and graded.
- **Signal grading** — journaled calls are scored later against outcomes, benchmark-adjusted, so the desk learns which of its own signals to distrust.
- **Review gates** — a capability becomes eligible for formal review only after a minimum sample of graded evidence; a review never grants authority by itself.

## Memory

- **Journal** — append-only decision record: thesis, invalidation, outcome, process grade.
- **Durable notes** — distilled laws and facts that persist across sessions.
- **Doctrine** — the rules that graded evidence earns. The recipe this repo documents.

## What is intentionally not described here

Deployment specifics: hosts, runners, credentials, wallet addresses, private journals, and operational logs. They stay on the private side. If a future public document needs a detail, it is generalized until it carries no operational information.