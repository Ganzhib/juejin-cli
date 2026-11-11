# Development conventions

- Trace the shared mechanism and affected call chain before changing behavior. Keep platform requests in `src/client.ts`, HTTP behavior in `src/http.ts`, and CLI presentation in `src/cli.ts`.
- Trust typed successful platform responses. Handle business error codes and nullable `data` at the HTTP boundary; validate user files and command arguments at their input boundaries.
- Never automatically replay writes after an exception or timeout. Preserve operation receipts and return existing draft/column IDs on failures.
- Keep account cookies local, out of logs, fixtures, commits and upload-host requests. Offline tests must use fabricated credentials.
- JSON mode emits one JSON document on stdout for success or stderr for failure. Diagnostic messages go to stderr.
- Branch names: `ganzhibin/<feature|bugfix|hotfix|refactor|chore|docs|test>/<english-description>`. Check current and existing branches before creation.
- Commit messages: `<type>(<scope>): <中文描述>`, using `feat`, `fix`, `refactor`, `chore`, `docs`, or `test` according to the actual change.
- Run `npm run check`, `npm test`, and `npm run build` before committing. Public network smoke tests are opt-in (`npm run smoke`); they perform no authenticated writes.
- Preserve the upstream attribution in `THIRD_PARTY_NOTICES.md` when editing ImageX signing/upload code.
