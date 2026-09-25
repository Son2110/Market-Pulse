# Repository working agreements

## Product context

MarketPulse VN is a planning-stage market intelligence project for Vietnam. Read the original requirements in [MarketPulse_VN_Project_Documentation.md](MarketPulse_VN_Project_Documentation.md) and the scoped requirements in [docs/PRD.md](docs/PRD.md) before implementation. Preserve the original document unchanged. Market data, news and events require clear source, currency, timezone, as-of time and freshness labels. Never present market association as causation or the product as investment advice.

## Codex workflow

- Use GPT-6 Astra at medium reasoning as the requested coordinator for planning and independent review.
- Use GPT-6 Luna at max reasoning for explicitly delegated implementation with a bounded write scope, acceptance criteria and required checks. Do not recursively delegate.
- If a requested model or capability is unavailable, report that limitation; do not silently substitute or claim a model switch.
- The coordinator reviews worker changes and verification evidence independently. Workers report changed files, checks run and limitations.
- Work on one task at a time with one worker. Finish implementation, required checks and independent review before starting another task. Do not run parallel task implementations or delegate recursively.
- Preserve existing user changes. Keep implementation scope aligned with an approved task and avoid modifying unrelated files.
- Keep authored code comments concise, usually one or two lines, and explain intent or a non-obvious constraint.

## FR branches and review

- Start each FR from the current `main` on `feat/fr-XX-short-name` (for example, `feat/fr-03-stock-search`). Keep one FR per branch and pull request, and work on one task at a time. Split a large FR into serial smaller pull requests using the same FR ID with numbered suffixes.
- Use `ci/...` or `docs/...` branches for infrastructure or documentation work; do not assign it a fictitious FR.
- Implement and run the applicable existing checks, then get an independent GPT-6 Astra review before pushing the pull request. Do not invent runtime checks that the repository does not provide.
- Before merge, obtain a substantive CodeRabbit review on the pull request. Address justified findings with evidence; do not apply suggestions blindly. Rerun CI and have CodeRabbit incrementally review the latest commit.
- Squash-merge only after required checks pass, review is satisfied, and all review conversations are resolved. Do not push directly to `main` or bypass reviews. Sync with current `main` before starting the next FR.

## Frontend page workflow

- During frontend work, use Stitch to design one page at a time before implementing that page. Keep the page consistent with the shared design system.
- Include the chosen Stitch project and screen reference in the task handoff. Inspect the page at responsive sizes and review its loading, empty, and error states.
- Implement, check, and review the current page before moving to the next page. Work serially with one worker; do not run frontend pages or tasks concurrently. The coordinator's review can finalize each page without requiring separate user approval.
- If Stitch is unavailable, report the concrete blocker. Do not silently substitute another design tool or claim a Stitch design was made.

Model names in this file express the project workflow requested by the owner. They do not change the active model or runtime settings.
