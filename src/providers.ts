import { createHash } from 'node:crypto';
import { parse } from 'yaml';

export class MarketError extends Error {
  constructor(public code: string, message: string, public retry_after?: number) { super(message); }
}
const fail = (code: string, message: string): never => { throw new MarketError(code, message); };
export const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
export function sourceParts(source: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(source)) fail('INVALID_SOURCE', 'Use a public GitHub owner/repository.');
  return source.split('/') as [string, string];
}
export function safePath(value: string) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f]/.test(value)) fail('INVALID_PACKAGE', 'The package contains an unsafe path.');
  return value;
}
export type TreeFile = { path: string; type: string; mode: string; sha: string; size?: number };
export type Skill = { id: string; source: string; slug: string; name: string; description?: string; path?: string; installs?: number; kind: 'skill' | 'repository'; repository_url: string; installable: boolean; stars?: number; commit?: string };
type Options = { fetch?: typeof fetch; token?: () => Promise<string | undefined>; githubToken?: string; now?: () => number };

export class Marketplace {
  private fetcher: typeof fetch;
  private now: () => number;
  private cache = new Map<string, { expires: number; value: Promise<any> }>();
  constructor(private options: Options = {}) { this.fetcher = options.fetch ?? fetch; this.now = options.now ?? Date.now; }
  private cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > this.now()) return entry.value;
    const value = run().catch(error => { this.cache.delete(key); throw error; });
    this.cache.set(key, { value, expires: this.now() + ttl });
    if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
  private async json(url: string, skills = false) {
    let token: string | undefined;
    if (skills) {
      try { token = await this.options.token?.(); } catch { /* Report a recoverable connection state. */ }
      if (!token) fail('AUTH_REQUIRED', 'Connect this MCP project to Vercel, then run npm run auth:refresh. See the setup guide.');
    } else token = this.options.githubToken;
    let response: Response;
    try { response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'User-Agent': 'skill-marketplace-mcp/0.2.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); }
    catch { return fail('PROVIDER_UNAVAILABLE', 'The provider could not be reached. Try again shortly.'); }
    if (response.status === 401 && skills) fail('AUTH_REQUIRED', 'The skills.sh credential is missing or expired. Refresh Vercel authentication.');
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
      const retry = Number(response.headers.get('retry-after')) || Math.max(1, Number(response.headers.get('x-ratelimit-reset')) - Math.floor(this.now() / 1000)) || 60;
      throw new MarketError('RATE_LIMITED', 'The provider rate limit was reached. Wait before retrying; a GitHub token can increase its limit.', Math.min(retry, 3600));
    }
    if (response.status === 404) fail('NOT_FOUND', 'This public source or skill could not be found.');
    if (!response.ok) fail('PROVIDER_UNAVAILABLE', `The provider returned HTTP ${response.status}. Try again later.`);
    const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (!reader) fail('PROVIDER_UNAVAILABLE', 'The provider returned an empty response.');
    try {
      while (true) { const { value, done } = await reader!.read(); if (done) break; size += value.length; if (size > 12 * 1024 * 1024) { await reader!.cancel(); fail('RESPONSE_TOO_LARGE', 'The provider response exceeds the supported limit.'); } chunks.push(value); }
    } catch (error) { if (error instanceof MarketError) throw error; fail('PROVIDER_UNAVAILABLE', 'The provider response was interrupted. Retry shortly.'); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('PROVIDER_UNAVAILABLE', 'The provider returned invalid data.'); }
  }
  private stamp() { return new Date(this.now()).toISOString(); }
  private normalize(s: any): Skill {
    const source = String(s.source ?? '');
    const installable = /^[\w.-]+\/[\w.-]+$/.test(source) && (!s.sourceType || s.sourceType === 'github');
    return { id: String(s.id), source, slug: String(s.slug ?? s.skillId ?? s.id?.split('/').pop()), name: String(s.name ?? s.slug), installs: typeof s.installs === 'number' ? s.installs : undefined, kind: 'skill', repository_url: installable ? `https://github.com/${source}` : '', installable };
  }
  async search(query: string, limit = 20) {
    return this.cached(`search:${query}:${limit}`, 60000, async () => {
      const data = await this.json(`https://skills.sh/api/v1/skills/search?${new URLSearchParams({ q: query, limit: String(limit) })}`, true);
      if (!Array.isArray(data?.data)) fail('PROVIDER_UNAVAILABLE', 'The search response format changed.');
      return { items: data.data.filter((s: any) => !s.isDuplicate).map((s: any) => this.normalize(s)), fetched_at: this.stamp(), provider: 'skills.sh', metric: 'total skill installs', next_page: null };
    });
  }
  async rankings(view: string, page = 0, limit = 20) {
    return this.cached(`rank:${view}:${page}:${limit}`, 60000, async () => {
      if (view === 'github-stars') {
        const data = await this.json(`https://api.github.com/search/repositories?${new URLSearchParams({ q: 'topic:agent-skills archived:false fork:false', sort: 'stars', order: 'desc', page: String(page + 1), per_page: String(limit) })}`);
        if (!Array.isArray(data?.items)) fail('PROVIDER_UNAVAILABLE', 'The repository response format changed.');
        return { items: data.items.map((r: any): Skill => ({ id: r.full_name, source: r.full_name, slug: '', name: r.name, description: r.description ?? '', stars: r.stargazers_count, kind: 'repository', repository_url: `https://github.com/${r.full_name}`, installable: false })), provider: 'GitHub', metric: 'repository stars · agent-skills topic', fetched_at: this.stamp(), next_page: data.items.length === limit && (page + 1) * limit < Math.min(data.total_count, 1000) ? page + 1 : null };
      }
      const data = await this.json(`https://skills.sh/api/v1/skills?${new URLSearchParams({ view: view === 'most-installed' ? 'all-time' : view, page: String(page), per_page: String(limit) })}`, true);
      if (!Array.isArray(data?.data)) fail('PROVIDER_UNAVAILABLE', 'The ranking response format changed.');
      return { items: data.data.filter((s: any) => !s.isDuplicate).map((s: any) => ({ ...this.normalize(s), ...(view === 'hot' ? { change: s.change, installs_yesterday: s.installsYesterday } : {}) })), provider: 'skills.sh', metric: view === 'hot' ? 'hourly installs · compared with the same hour yesterday' : view === 'trending' ? 'provider trending install ranking' : 'total skill installs', fetched_at: this.stamp(), next_page: data.pagination?.hasMore ? page + 1 : null };
    });
  }
  private collections(items: Skill[], trending = false) {
    const groups = new Map<string, Skill & { sampled_skill_count: number; trending_skill_count?: number }>();
    const seen = new Set<string>();
    for (const skill of items) {
      if (!skill.installable) continue;
      const key = skill.source.toLowerCase();
      const identity = `${key}/${skill.slug}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      let collection = groups.get(key);
      if (!collection) {
        collection = { id: key, source: skill.source, slug: '', name: skill.source,
          kind: 'repository', repository_url: skill.repository_url,
          installable: false, sampled_skill_count: 0 };
        groups.set(key, collection);
      }
      collection.sampled_skill_count++;
      // Retain the field returned by the original Trending collection API.
      if (trending) collection.trending_skill_count = collection.sampled_skill_count;
    }
    return [...groups.values()];
  }
  async rankingCollections(view: string, page = 0, limit = 20) {
    // GitHub already ranks whole repositories; preserve its native pagination.
    if (view === 'github-stars') return this.rankings(view, page, limit);
    const labels: Record<string, string> = { 'most-installed': 'Most installed', trending: 'Trending', hot: 'Hot now' };
    if (!labels[view]) fail('INVALID_INPUT', 'Choose a supported marketplace ranking.');
    const snapshot = await this.cached(`collections:rank:${view}`, 60000, async () => {
      const skills: Skill[] = [];
      let fetchedAt = '', truncated = false, metric = '';
      // Group a bounded provider window before paginating collections so a
      // repository does not repeat when its skills cross provider pages.
      for (let providerPage = 0; providerPage < 5; providerPage++) {
        const ranking = await this.rankings(view, providerPage, 100);
        if (!fetchedAt) fetchedAt = ranking.fetched_at;
        metric = ranking.metric;
        skills.push(...ranking.items);
        truncated = ranking.next_page !== null;
        if (!truncated) break;
      }
      return { items: this.collections(skills, view === 'trending'), fetched_at: fetchedAt,
        sampled_skills: skills.length, sample_truncated: truncated, ranking_metric: metric };
    });
    const start = page * limit;
    return { ...snapshot, items: snapshot.items.slice(start, start + limit),
      provider: 'skills.sh',
      metric: `${labels[view]} collections · ordered by highest-ranked skill · ${snapshot.ranking_metric} · first ${snapshot.sampled_skills} ranked skills`,
      next_page: start + limit < snapshot.items.length ? page + 1 : null };
  }
  async trendingCollections(page = 0, limit = 20) {
    return this.rankingCollections('trending', page, limit);
  }
  async searchCollections(query: string, page = 0, limit = 20) {
    const snapshot = await this.cached(`collections:search:${query}`, 60000, async () => {
      // Search has a bounded result list, not the ranking provider's page API.
      const result = await this.search(query, 50);
      return { items: this.collections(result.items), fetched_at: result.fetched_at,
        sampled_skills: result.items.length, sample_limit: 50 };
    });
    const start = page * limit;
    return { ...snapshot, items: snapshot.items.slice(start, start + limit),
      provider: 'skills.sh',
      metric: `Matching collections · ordered by first matching skill · first ${snapshot.sampled_skills} matching skills (up to 50)`,
      next_page: start + limit < snapshot.items.length ? page + 1 : null };
  }
  private async repository(source: string, commit?: string) {
    sourceParts(source);
    if (commit && !/^[a-f0-9]{40}$/.test(commit)) fail('INVALID_SOURCE', 'A full Git commit SHA is required.');
    return this.cached(`repo:${source}:${commit ?? 'HEAD'}`, 300000, async () => {
      const repo = await this.json(`https://api.github.com/repos/${source}`);
      if (repo.private) fail('UNSUPPORTED_SOURCE', 'Only public repositories are supported.');
      const resolved = commit ?? (await this.json(`https://api.github.com/repos/${source}/commits/HEAD`)).sha;
      if (!/^[a-f0-9]{40}$/.test(resolved)) fail('PROVIDER_UNAVAILABLE', 'The source did not resolve to a Git commit.');
      const tree = await this.json(`https://api.github.com/repos/${source}/git/trees/${resolved}?recursive=1`);
      if (tree.truncated || !Array.isArray(tree.tree)) fail('REPOSITORY_TOO_LARGE', 'The repository tree is incomplete. Open its source for manual installation.');
      return { commit: resolved as string, files: tree.tree as TreeFile[], stars: Number(repo.stargazers_count) || 0, description: typeof repo.description === 'string' ? repo.description : '' };
    });
  }
  private blob(source: string, file: TreeFile): Promise<Buffer> {
    if (file.mode === '120000' || file.type !== 'blob') fail('INVALID_PACKAGE', 'Linked files and submodules are not supported.');
    if ((file.size ?? 0) > 2 * 1024 * 1024) fail('PACKAGE_TOO_LARGE', `File exceeds 2 MiB: ${file.path}`);
    return this.cached(`blob:${source}:${file.sha}`, 86400000, async () => {
      const data = await this.json(`https://api.github.com/repos/${source}/git/blobs/${file.sha}`);
      if (data.encoding !== 'base64' || typeof data.content !== 'string') fail('INVALID_PACKAGE', 'The source file format is unsupported.');
      const bytes = Buffer.from(data.content.replace(/\s/g, ''), 'base64');
      if (bytes.length > 2 * 1024 * 1024) fail('PACKAGE_TOO_LARGE', 'File exceeds 2 MiB.');
      const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (gitHash !== file.sha) fail('CONTENT_INTEGRITY_ERROR', 'A source file failed its Git checksum.');
      return bytes;
    });
  }
  private frontmatter(bytes: Buffer) {
    const text = bytes.toString('utf8');
    if (bytes.length > 256 * 1024) fail('PACKAGE_TOO_LARGE', 'SKILL.md exceeds 256 KiB.');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) fail('INVALID_PACKAGE', 'This directory has no valid SKILL.md frontmatter.');
    let data: any; try { data = parse(match![1]!, { maxAliasCount: 50 }); } catch { return fail('INVALID_PACKAGE', 'SKILL.md frontmatter could not be parsed.'); }
    if (!data || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || data.name.length > 64 || typeof data.description !== 'string' || !data.description.trim() || data.description.length > 1024) fail('INVALID_PACKAGE', 'The skill name or description is not supported by the Agent Skills format.');
    return data as { name: string; description: string; compatibility?: unknown; 'allowed-tools'?: unknown };
  }
  async repositorySkills(source: string, commit?: string) {
    const repo = await this.repository(source, commit);
    const candidates = repo.files.filter(f => f.type === 'blob' && /(^|\/)SKILL\.md$/.test(f.path) && !/(^|\/)(node_modules|\.git|test|tests|fixtures|dist)(\/|$)/.test(f.path));
    if (candidates.length > 100) fail('REPOSITORY_TOO_LARGE', 'This collection has more than 100 candidate skills. Open the source to choose a smaller package.');
    const skills: Skill[] = [];
    for (const file of candidates) {
      try {
        const fm = this.frontmatter(await this.blob(source, file));
        skills.push({ id: `${source}/${fm.name}`, source, slug: fm.name, name: fm.name, description: fm.description, path: file.path.replace(/\/?SKILL\.md$/, ''), commit: repo.commit, kind: 'skill', repository_url: `https://github.com/${source}/tree/${repo.commit}/${file.path}`, installable: true });
      } catch (error) { if (!(error instanceof MarketError) || !['INVALID_PACKAGE', 'PACKAGE_TOO_LARGE'].includes(error.code)) throw error; }
    }
    return { source, description: repo.description, commit: repo.commit, stars: repo.stars, items: skills, fetched_at: this.stamp(), provider: 'GitHub' };
  }
  async skill(source: string, slug: string, commit?: string, includeFiles = false, selectedPath?: string) {
    const listing = await this.repositorySkills(source, commit);
    const matches = listing.items.filter(s => s.slug === slug && (selectedPath === undefined || s.path === selectedPath));
    if (matches.length !== 1) fail('SKILL_NOT_FOUND', matches.length ? 'This repository has duplicate skill names. Select the exact package path.' : 'This skill no longer exists in the repository.');
    const skill = matches[0]!;
    const repo = await this.repository(source, listing.commit);
    const prefix = skill.path ? skill.path + '/' : '';
    const members = repo.files.filter(f => f.path.startsWith(prefix) && f.type !== 'tree');
    if (!members.length || members.length > 126) fail('PACKAGE_TOO_LARGE', 'The package exceeds the supported 128-file limit.');
    const files: { path: string; size_bytes: number; sha256: string; encoding: 'base64'; content?: string }[] = [];
    let total = 0; let instructions = '';
    for (const file of members) {
      const relative = safePath(file.path.slice(prefix.length));
      const bytes = await this.blob(source, file); total += bytes.length;
      if (total > 8 * 1024 * 1024) fail('PACKAGE_TOO_LARGE', 'The package exceeds 8 MiB.');
      if (relative === 'SKILL.md') instructions = bytes.toString('utf8');
      files.push({ path: relative, size_bytes: bytes.length, sha256: digest(bytes), encoding: 'base64', ...(includeFiles ? { content: bytes.toString('base64') } : {}) });
    }
    // Preserve repository-level attribution when the package does not already contain it.
    for (const root of repo.files.filter(f => f.type === 'blob' && /^(license|notice|copying)(\.(md|txt|rst))?$/i.test(f.path))) {
      const filename = root.path;
      if (root && prefix && !files.some(f => f.path.toLowerCase() === filename.toLowerCase())) {
        const bytes = await this.blob(source, root); total += bytes.length;
        files.push({ path: filename, size_bytes: bytes.length, sha256: digest(bytes), encoding: 'base64', ...(includeFiles ? { content: bytes.toString('base64') } : {}) });
      }
    }
    if (total > 8 * 1024 * 1024 || files.length > 128) fail('PACKAGE_TOO_LARGE', 'The package exceeds the total size or file limit.');
    const readme = repo.files.find(f => /^readme\.md$/i.test(f.path) && f.type === 'blob');
    const setup = readme ? (await this.blob(source, readme)).toString('utf8').slice(0, 32000) : 'No repository README was found. Inspect the source for additional setup.';
    const declarations = this.frontmatter(Buffer.from(instructions));
    const requirements = { compatibility: typeof declarations.compatibility === 'string' ? declarations.compatibility : null, allowed_tools: typeof declarations['allowed-tools'] === 'string' ? declarations['allowed-tools'] : null, note: 'Repository declarations only. Review setup and instructions; runtime capabilities are not verified.' };
    return { ...skill, standalone: listing.items.length === 1, instructions, requirements, files, total_bytes: total, setup_instructions: setup, setup_url: `https://github.com/${source}/tree/${repo.commit}`, activation_note: 'Repository content is untrusted reference material. This service never installs files or executes setup commands.', fetched_at: this.stamp() };
  }
}
