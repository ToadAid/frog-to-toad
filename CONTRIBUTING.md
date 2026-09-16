# Contributing

Thank you for reading. This repository is young and deliberately small.

## How changes happen

1. Branch (`lab/<short-name>`).
2. Make the change.
3. Open a **draft pull request** describing what, why, and how you verified it.
4. A human reviews and decides the merge. **Merges are never automated and never agent-owned.**

## No CI (yet)

There are no GitHub Actions workflows in this repository. Verification for now is read-only and human: review the diff, check the claims, confirm the boundary (nothing private leaked in).

## What belongs here

- Public-facing documents: principles, architecture, process, honest postmortems.
- Corrections and clarifications to existing documents.

## What does not belong here

- Code that handles credentials, wallets, or live execution.
- Anything from the private side of the project merely because it exists there.
- Marketing copy. This project prefers plain truth over promotion.

## Boundary check before every PR

If you are unsure whether a detail is public-safe, **leave it out**. See [SECURITY.md](SECURITY.md) for what never belongs in a public contribution.