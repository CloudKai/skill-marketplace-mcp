# Changelog

## Unreleased

- Add a separate authenticated Vercel Express entry point for hosted discovery, with health status and fail-closed service credentials.
- Keep package-byte downloads on the local transport; hosted clients can inspect instructions and manifests.
- Exclude local credentials and metadata from deployment.


## 0.2.0 · 2026-10-26

- Add optional repository grouping for Most installed, Trending, Hot now and keyword search, deduplicated before collection pagination and ordered by highest-ranked member skill.
- Disclose the bounded provider window and sampled skill counts without inventing project install statistics.
- Include repository descriptions with verified collection skill pickers.
- Preserve individual ranking and search results by default for existing MCP clients; keep GitHub repository-star pagination native.
- Cache immutable Git blob contents for 24 hours to reduce repeat collection-inspection requests; repository metadata still refreshes after five minutes.

## 0.1.0 · 2026-10-26

- Add four read-only skill discovery MCP tools over stdio and local Streamable HTTP.
- Normalize authenticated skills.sh search and all-time, trending and hot rankings; preserve provider metrics and freshness.
- Add topic-filtered GitHub star discovery and verified collection inspection.
- Resolve public skill packages to full commits with content verification and attribution.
- Bound caches, downloads and package contents; return actionable auth, rate-limit and upstream errors.
- Add fixture tests and real MCP transport verification.
