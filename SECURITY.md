# Security Policy

## Scope

This repository currently contains documentation only — no code, no CI, no automation. There is nothing here to execute. Reports about the *documents* (errors, unclear boundaries, anything that reads as private information) are welcome as issues.

## Reporting a vulnerability

If you believe you have found a security issue in the broader Frog-to-Toad system, do **not** open a public issue with details. Use GitHub's private security advisory feature for this repository, or contact the maintainer directly.

## What never belongs in issues or PRs

- API keys, tokens, PATs, wallet keys, seed phrases
- Wallet addresses tied to real funds
- Private journals, logs, or operational details
- Machine names, filesystem paths, or infrastructure specifics

If a contribution accidentally includes any of these, it will be removed before review. When in doubt, leave it out.

## Boundary principle

**Open recipe. Private credentials. Bounded authority. Public evidence.**