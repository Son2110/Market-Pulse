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

## Frontend page workflow

- During frontend work, use Stitch to design one page at a time before implementing that page. Keep the page consistent with the shared design system.
- Include the chosen Stitch project and screen reference in the task handoff. Inspect the page at responsive sizes and review its loading, empty, and error states.
- Implement, check, and review the current page before moving to the next page. Work serially with one worker; do not run frontend pages or tasks concurrently. The coordinator's review can finalize each page without requiring separate user approval.
- If Stitch is unavailable, report the concrete blocker. Do not silently substitute another design tool or claim a Stitch design was made.

Model names in this file express the project workflow requested by the owner. They do not change the active model or runtime settings.
