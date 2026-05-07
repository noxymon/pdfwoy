# pdfwoy

Local-first PDF utility CLI (convert to JPG, compress). ESM TypeScript, Node 20+, distributed on npm.

## Commands

```bash
npm run dev -- <args>           # Run CLI via tsx (no build)
npm run build                   # tsup → dist/cli.js (ESM, target node20)
npm run test:integration        # vitest, exercises the built CLI
npm run test:integration:docker # cross-platform integration via Docker
```

No unit tests — only integration tests. They spawn `dist/cli.js`, so **build before testing**.

## Architecture

- `src/cli.ts` — commander entry; registers `jpg`, `compress`, `doctor`, `install-deps`. A `preAction` hook (`src/utils/deps.ts`) gates commands that need Ghostscript.
- `src/commands/*` — one file per subcommand.
- `src/utils/platform.ts` — platform detection + install hints. Source of truth for "can we auto-install GS here?".
- `src/utils/deps.ts` — Ghostscript resolution: cached binary → PATH → install. `UserError` is the user-facing error class; `cli.ts` formats it without a stack trace.
- `test/integration.test.ts` — generates the fixture PDF at runtime via `gs`. The `jpg` suite auto-skips if `canvas` failed to build (Windows).

## Gotchas

- **ESM import extensions:** TS source uses `.js` in relative imports (`./commands/x.js`). This is correct — don't "fix" it.
- **Ghostscript:** `compress` needs `gs` on PATH; `jpg` does not. Auto-install only on macOS/Linux. Windows is intentionally manual — Artifex's NSIS installer ignores `/S` (see comment in `platform.ts`).
- **`canvas` on Windows** can fail to build natively; integration tests detect this and skip JPG cases.
- **Package manager:** `pnpm-lock.yaml` exists but `npm install` works. Don't regenerate the lockfile on a whim.
- **Published tarball** includes `src/`, `test/`, `.github/` — there's no `files` field in `package.json`. If trimming, add one.
- **`.npmrc` is NOT gitignored.** Don't create one with secrets. For npm auth, pass the token inline via `--//registry.npmjs.org/:_authToken=$TOKEN`.

## Release

1. Bump `package.json` version
2. `npm run build`
3. Commit `chore: release X.Y.Z` describing what's in it
4. `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
5. `git push origin main && git push origin vX.Y.Z`
6. `npm publish --access public` (token lives in `.env`, gitignored)
