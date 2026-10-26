import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { fileURLToPath } from 'node:url';
import { Marketplace } from './providers.js';
import { createServer } from './server.js';
import { rankingToken } from './auth.js';
export async function startHttp(market = new Marketplace({ token: rankingToken, githubToken: process.env.GITHUB_TOKEN }), port = 3334) {
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.status(403).json({ error: 'Origin not allowed' }); return; } next(); });
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.2.0', read_only: true }));
  app.post('/mcp', async (req, res) => {
    const server = createServer(market); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' }); }
  });
  app.all('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Use POST for stateless MCP requests' }); });
  return await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const server = app.listen(port, '127.0.0.1', () => resolve(server)); server.on('error', reject); });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3334);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = await startHttp(undefined, port);
  console.error(`Skill Marketplace MCP: http://127.0.0.1:${port}/mcp`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
}
