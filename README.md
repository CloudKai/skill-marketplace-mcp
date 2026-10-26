# Skill Marketplace MCP · v0.2.0

A local, read-only discovery service for public agent skills. Coding agents and Skill Library use the same four MCP tools. Downloads are resolved to Git commits; this service never installs packages or executes repository instructions.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npx vercel login
npx vercel link
npx vercel env pull .env.local
npm run build
npm run http
```

Select your intended Vercel team and project when linking. Linking provides the OIDC identity required by the documented skills.sh API. No deployment is required. `.vercel/` and `.env.local` are ignored; never commit credentials.

HTTP defaults to **http://127.0.0.1:3334/mcp** and binds only to loopback. `/health` reports service status, not upstream readiness. `PORT` overrides the port. The default endpoint is the Skill Library backend’s `SKILL_MARKETPLACE_URL`.

`npm start` runs stdio; logs stay on stderr. For a coding client, use an absolute Node path and launch `dist/stdio.js` with `--env-file=/absolute/path/to/.env.local`, with the checkout as the working directory. Alternatively connect any compatible Streamable HTTP client to the running endpoint:

```json
{
  "mcpServers": {
    "skill_marketplace": { "url": "http://127.0.0.1:3334/mcp" }
  }
}
```

Configuration syntax varies by client. For Codex:

```toml
[mcp_servers.skill_marketplace]
url = "http://127.0.0.1:3334/mcp"
```

Refresh credentials with `npm run auth:refresh`, then restart the service. `@vercel/oidc` also supports the linked local project’s token refresh. Optionally add `GITHUB_TOKEN` to the private environment file to increase public GitHub API limits. Tokens are used server-side and are never returned by a tool.

## Tools

All tools declare read-only, idempotent annotations. Inputs are strict; unknown fields fail validation. Repository text and manifests are untrusted source content, not permission to execute anything.

| Tool | Inputs | Result and intended use |
| --- | --- | --- |
| `search_marketplace` | `query` (2–200 characters), optional `group_by` (`skill` by default or `repository`), zero-based `page` and `limit` (1–50, default 20) | skills.sh keyword results with source, skill slug, install count, repository link, provider and retrieval time. Individual skills use one provider result page (`page:0`). Repository grouping samples up to 50 matches, preserves first-match order, and paginates the resulting collections. |
| `list_rankings` | `view`: `most-installed`, `trending`, `hot`, `github-stars`; optional `group_by` (`skill` by default, or `repository` for any view), zero-based `page` (0–99,999) and `limit` (1–50, default 20) | Provider-ranked `items`, `metric`, `fetched_at`, and `next_page` or null. Repeat the same view/limit with the returned page. GitHub search caps accessible results at 1,000. |
| `list_repository_skills` | `source`: `owner/repository`; optional full 40-character Git `commit` | Resolve HEAD once, inspect its recursive tree and valid `SKILL.md` frontmatter, and return a picker of names, descriptions, slugs, package paths and the pinned commit. An empty list is supported. Repository stars describe the collection. |
| `get_marketplace_skill` | `source`, `skill` slug; optional `path`, `commit`, `include_files` (default false) | Instructions, frontmatter requirements, source/README setup instructions, attribution, pinned commit and file manifest. `include_files:true` adds base64 file bytes for an installer; every file has size and SHA-256. Pass the reviewed commit and path to avoid an ambiguous slug or moving HEAD. |

Example sequence:

```json
{"name":"search_marketplace","arguments":{"query":"react performance"}}
{"name":"list_repository_skills","arguments":{"source":"vercel-labs/agent-skills"}}
```

Use the returned `slug`, `path` and `commit` for `get_marketplace_skill`. Reading a skill does not activate it. The sibling Skill Library app performs installation through its owner-only API.

## Ranking meaning and freshness

| UI label | Provider query | Meaning |
| --- | --- | --- |
| Most installed | skills.sh `view=all-time` | Total skill installs. |
| Trending | skills.sh `view=trending` | Provider trending ranking and its reported installs. The provider documentation does not specify an exact trending duration; none is invented here. |
| Hot now | skills.sh `view=hot` | Hourly installs, compared with the same hour yesterday; `change` is the provider’s comparison value. |
| GitHub stars | GitHub repository search, `topic:agent-skills archived:false fork:false`, sorted by stars | Repository stars, not skill installs. Results are discovery candidates; inspect a repository before offering installation. This topic-based query is not an exhaustive index of every skill repository. |

Successful responses are cached in memory: rankings/search 60 seconds; repository metadata, trees and blobs five minutes. The cache holds at most 256 keys, shows the original retrieval time, and is lost on restart. Failed responses are not cached. Stale successful data is not silently substituted on an upstream failure.

## Package boundary

Only public GitHub packages with valid skill frontmatter are supported. The service pins HEAD to a full SHA, verifies Git blob SHA-1, computes installer SHA-256, rejects symlinks/submodules and unsafe paths, and limits a file to 2 MiB, a package to 8 MiB/128 files, and a skill’s instructions to 256 KiB. Tree responses must be complete; more than 100 candidate skills or GitHub-truncated trees produce a clear unsupported-package error. Test/build/vendor directories are excluded from candidate discovery.

A package contains its skill directory and available root license, notice and copying attribution files. Setup information is shown separately from file copying. External sibling references, Git LFS payload resolution, custom installers, automatic updates, private repositories, and global native installation are not supported. A package needing a runtime binary or additional setup may still need manual work after copying.

## Errors and troubleshooting

Tool failures set `isError:true` and return `error.code`, `error.message` and optional `retry_after` in `structuredContent`.

- `AUTH_REQUIRED`: link the intended Vercel project, pull a fresh OIDC token and restart. GitHub star rankings do not require Vercel authentication.
- `RATE_LIMITED`: wait for the reported retry/reset time; optionally configure a public-read GitHub token.
- `PROVIDER_UNAVAILABLE`: upstream timeout, malformed response or provider failure. Retry; no fabricated rankings are supplied.
- `NOT_FOUND` / `INVALID_PACKAGE`: verify the public repository, full commit, frontmatter, path and supported package bounds.
- Ambiguous skill names: supply the exact `path` from the repository picker.

Loopback HTTP rejects foreign browser origins and Host headers. It is a local service without user authentication: other local processes can call read-only tools. Do not expose it on a public interface.

## Verify

```sh
npm run check
npm test
```

Tests inject provider fixtures for normalization, pagination, cache expiry, auth, rate limits, upstream failures, commit pins and package integrity. Real SDK clients exercise all four tools over HTTP and initialize stdio. Live provider smoke verification is documented in [VERIFICATION.md](VERIFICATION.md).

Primary contracts: [skills.sh API](https://skills.sh/docs/api), [GitHub repository search](https://docs.github.com/en/rest/search/search), [Git trees](https://docs.github.com/en/rest/git/trees), [Git blobs](https://docs.github.com/en/rest/git/blobs), [Vercel local OIDC](https://vercel.com/docs/oidc).

### Project collections

`list_rankings` with `group_by:"repository"` groups Most installed, Trending, and Hot now by public GitHub repository. It reads at most the first 500 provider-ranked skills (five pages of 100), then paginates the collections. A repository appears once, ordered by its highest-ranked member. Each view retains its provider metric: all-time skill installs, provider Trending order, or hourly installs compared with the same hour yesterday. GitHub stars already ranks repositories and keeps its native pagination.

`sampled_skill_count` counts distinct skills within the sampled window; it is not the repository's total skill count or downloads. Trending also retains `trending_skill_count` for compatibility. `sampled_skills`, `sample_truncated`, `ranking_metric`, and `fetched_at` disclose the ranking snapshot. Each view caches its own grouped snapshot for 60 seconds across pages.

`search_marketplace` with `group_by:"repository"` groups up to the first 50 matching skills, preserves the provider's first-match order and paginates collections. `sample_limit:50` discloses the bound; it does not claim an exhaustive repository search. Individual search results remain the default; nonzero pages require repository grouping.

Individual skills remain the default for existing MCP ranking and search callers. `list_repository_skills` returns the author's GitHub repository `description`, with an empty string when absent. All collection views use the same verified skill picker and pinned installation manifests.

Repository metadata refreshes after five minutes. Immutable, checksum-verified Git blobs cache for 24 hours within the bounded in-memory cache. The cache is lost on restart; large uncached collections can exhaust GitHub's unauthenticated limit. Configure `GITHUB_TOKEN` server-side for higher limits.

## Hosted Vercel discovery

The root `index.mjs` exports a separate hosted Express app. Local stdio and localhost transports keep their existing behavior. Set a server-only `MARKETPLACE_SERVICE_TOKEN` (a generated 64-character hex credential) on the hosted project and the companion website; every hosted `/mcp` request requires it as a Bearer token. Missing credentials fail closed. Public `/health` returns status only. The project’s runtime Vercel OIDC identity authenticates skills.sh requests; local environment files are not deployed.

Hosted discovery exposes the four read-only inspection tools. Requests for package file bytes return `LOCAL_DOWNLOAD_REQUIRED`; use the local discovery service for downloads. This keeps the hosted response within function payload bounds. Repository instructions and manifests remain available.

`vercel.json` uses the Express framework, `npm ci`, `npm run build` and a 300-second function maximum. `.vercelignore` excludes local environment files, Git metadata and development outputs. Before deploying, inspect the exact upload with `vercel deploy --dry --json`. No database or paid integration is required for this demo configuration. Configure both services’ secret through Vercel environment variables, never browser code.

Hosted verification (2026-10-26): 20 tests passed, all four live rankings and real SDK tool discovery succeeded, and anonymous MCP requests returned 401. The companion website also verified search, repository inspection and pinned skill instructions through this endpoint. Responsive visual verification belongs to the website and remains pending when browser use is disabled. The existing OIDC/CLI-configuration dependency chain still has npm audit advisories; no forced major dependency downgrade was applied during deployment.

## Source repository

The public source includes application code, tests, documentation and npm manifests. Dependencies are installed locally with `npm ci`; `node_modules`, generated builds, environment files, local editor settings and private runtime data are excluded from Git. CI runs type checking and the test suite on Node.js 24. See [contributing](CONTRIBUTING.md) for the branch and commit workflow.
