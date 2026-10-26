# Verification · v0.1.0

Verified 26 October 2026 with Node.js 22.23.2. Both services run locally; no deployment was created.

- `npm test`: 11 passed, 0 failed. Provider fixtures cover ranking names and windows, normalization, search, pagination including GitHub’s 1,000-result window, cache expiry, failed-request retries, missing/expired credentials, rate limits, upstream failures/interrupted bodies, empty collections, pinned commits, requirements, attribution, symlink/size/truncated-tree rejection and checksums.
- Real MCP SDK HTTP client lists exactly four read-only tools and calls each against fixture providers; page 50 is accepted. Stdio SDK client initializes and returns an actionable missing-auth response without an internet dependency.
- Live MCP client successfully retrieved Most installed, Trending, Hot now, and GitHub stars; live keyword search returned skills.sh results. GitHub collection inspection resolved `vercel-labs/skills` to commit `a80e4c9d12d607631249d4d7d059f835d4b2f13a` with three valid skill packages.
- Live `get_marketplace_skill` resolved `find-skills` at that commit, including two files and repository attribution. The sibling website used this actual discovery MCP to install it into a disposable library and enable all three native destinations. Reading native package bytes and ownership markers confirmed all copies; the collection switch removed them while retaining the saved library package.
- The linked Vercel identity successfully authenticated skills.sh requests. `.env.local` and `.vercel/` remain ignored. Tokens were not printed, included in tool responses, or committed.

The live provider smoke test proves current connectivity; automated tests deliberately use fixtures so availability and counts do not make the suite flaky. No third-party setup script or AI model was executed. Native coding-agent discovery itself was not launched; disk destinations and reload guidance were verified through the library app.

## v0.2.0 Trending collections

- `npm test`: **14 passed**, including repository grouping before pagination, distinct member counts, bounded provider scanning and shared snapshots, optional grouping through the real HTTP MCP transport, and reuse of immutable blob contents across metadata refreshes.
- Existing callers still receive skill rankings by default; unsupported repository grouping modes return `INVALID_INPUT`.
- Live website calls returned unique collection pages and resolved Matt Pocock's collection description and 38 valid skills. Pinned skill inspection and return navigation worked. No installation was performed for this update.
- GitHub's public API rate limit interrupted final responsive collection captures. Immutable blob contents now cache for 24 hours; live HEAD metadata still refreshes after five minutes. Browser access was subsequently disabled. Final mobile collection and 682-pixel visual approval remain pending, so no release tag is claimed yet.

### All collection views

The discovery suite now passes **18 tests**, adding Most installed/Hot now grouping across provider pages, separate cached snapshots, bounded grouped search with collection pagination and first-match ordering, native GitHub repository pagination, empty/missing-auth behavior, and optional grouping over the real HTTP MCP client. The library's **33 tests** also verify website requests for every grouped ranking and paginated keyword search.

Live website → discovery MCP calls returned 20 distinct repositories per first page for Most installed, Trending and Hot now, with original ranking metrics and next-page pointers. Browser access is disabled; current UI captures and final responsive approval remain pending. Existing individual MCP results remain the default.

Additional live checks returned 20 unique repositories for GitHub stars with native pagination and 17 unique collections from the first 48 `design` search matches, with no next collection page. These exercised the actual running services on ports 3333/3334 and did not modify the saved library.
