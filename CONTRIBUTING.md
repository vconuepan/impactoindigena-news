# Contributing to Impacto Indígena

Thanks for your interest in contributing to Impacto Indígena! This is a non-commercial, AI-curated news platform built to surface stories that matter to indigenous peoples. The project is open source under AGPL v3 and is actively seeking a long-term institutional steward. Whether you're fixing a bug, suggesting a feature, or improving documentation, your help is welcome.

## Getting Started

See [README.md](README.md) for local development setup (prerequisites, database, environment variables, dev servers).

Once you're up and running, two directories are worth knowing before you change anything:

- **`.context/`** documents how each subsystem is built — content extraction, LLM analysis, newsletter pipeline, authentication, the six social channels, and more. [`.context/README.md`](.context/README.md) indexes all 25 files by area. Read the relevant one before modifying a subsystem.
- **`.specs/`** holds behavioral specifications in Allium. They define what the system *guarantees*: domain rules, entities, invariants. When a spec and a context file disagree, **the spec is authoritative** and the context file is what gets corrected.

If your change alters domain behavior — a new rule, a modified transition, a new entity — update the affected spec too.

## How to Contribute

### Security Vulnerabilities

**Do not open an issue.** Report vulnerabilities privately — see [SECURITY.md](SECURITY.md) for how, what to expect, and what is in scope.

### Bug Reports

Open a [GitHub Issue](../../issues) with:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Browser/OS/Node version if relevant

### Feature Suggestions

Open a [GitHub Issue](../../issues) to discuss the idea before writing code. This helps avoid duplicate effort and ensures the feature fits the project's direction. Describe the problem you're solving, not just the solution you have in mind.

### Pull Requests

1. Fork the repository and create a branch from `main`.
2. Make your changes in focused, well-scoped commits.
3. Include tests for new features or bug fixes (Vitest for both client and server — run `npm run test --prefix client -- --run` and `npm run test --prefix server`).
4. Follow the existing code conventions documented in `CLAUDE.md` (logging, retry logic, config patterns, American English in UI text, etc.).
5. Open a pull request against `main` with a clear description of what changed and why.

### Code Style

Follow the conventions already established in the codebase. Key points:

- TypeScript throughout (client and server)
- Use `createLogger('module')` for logging — no `console.log` in application code
- Wrap external HTTP and LLM calls with `withRetry()`
- Server config lives in `server/src/config.ts`
- American English in all user-facing text

### Commits

Write clear, descriptive commit messages. Keep changes focused — one logical change per commit. If a PR touches multiple subsystems, explain why in the PR description.

## Contributor License Agreement

Impacto Indígena is licensed under [AGPL v3](LICENSE). The project is exploring transfer to a long-term institutional steward (like a nonprofit, indigenous organization, or civic tech entity) — see [impactoindigena.news/stewardship](https://impactoindigena.news/stewardship) for background on this model.

To preserve the ability to offer a future steward flexible licensing terms as part of that transfer, we use a lightweight contributor agreement:

**By submitting a pull request, you agree that:**

1. Your contribution is your original work (or you have the right to submit it).
2. You license your contribution under the AGPL v3, consistent with the project's existing license.
3. You grant the project maintainer the right to relicense your contribution under different terms as part of a stewardship transfer.

This is similar to a Developer Certificate of Origin (DCO). No separate form or CLA signing process is required.

**Note for potential stewards:** Organizations interested in running impactoindigena.news long-term can receive more accommodating license terms directly from the copyright holder. See [impactoindigena.news/stewardship](https://impactoindigena.news/stewardship).

## Code of Conduct

Be respectful and constructive. This is a small, non-commercial project built in good faith. We expect contributors to:

- Be welcoming to newcomers
- Give and receive feedback gracefully
- Focus on what's best for the project and its users
- Assume good intentions

Harassment, personal attacks, and bad-faith behavior won't be tolerated.

## Questions?

Open a [GitHub Issue](../../issues) or email [contact@impactoindigena.news](mailto:contact@impactoindigena.news).

For security vulnerabilities, use the private channel in [SECURITY.md](SECURITY.md) instead.
