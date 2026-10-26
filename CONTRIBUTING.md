# Contributing

Use Node.js 24 and npm. Install dependencies with `npm ci`, then run `npm run check` and `npm test` before opening a pull request. Tests use local fixtures; no provider credentials are required.

Create a feature branch from `main`. Use conventional commits such as `feat:`, `fix:`, `docs:` and `chore:`. Keep changes focused and describe the resulting behavior and verification in the pull request.

Commit source, tests, documentation, `package.json` and `package-lock.json`. Keep the lockfile so installs are reproducible. Never commit `node_modules/`, `dist/`, coverage, logs, local editor settings, `.vercel/`, environment files or credentials. Use `.env.example` for documented placeholders only.

Local skill imports, scan inventory, project selections and managed installation state belong in ignored local storage. Keep real names and machine-specific paths out of shared examples, screenshots and issues. Review `git diff --cached` before pushing.

The public `main` branch begins with an audited source snapshot. Older local development branches and tags are retained only in the original checkout and are not part of the public history. Start future public work from `main`; do not push archived local branches or tags wholesale.

Bundled third-party packages retain their original attribution and license files. Preserve those files and review their terms when redistributing packages.
