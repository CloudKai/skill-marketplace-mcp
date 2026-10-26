import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Marketplace } from './providers.js';
import { createServer } from './server.js';
import { rankingToken } from './auth.js';

/** Hosted discovery is authenticated server-to-server; local transports remain unchanged. */
export function createHostedApp(market = new Marketplace({ token: rankingToken, githubToken: process.env.GITHUB_TOKEN }), serviceToken = process.env.MARKETPLACE_SERVICE_TOKEN) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); next(); });
  const health = { status: 'ok', version: '0.2.0', read_only: true, hosted: true, authentication_required: true };
  app.get('/', (_req,res) => res.json({ ...health, service: 'Skill Marketplace MCP', endpoint: '/mcp' }));
  app.get('/health', (_req,res) => res.json(health));
  app.post('/mcp', async (req,res) => {
    if (!serviceToken || !/^[a-f0-9]{64}$/.test(serviceToken)) { res.status(503).json({ error: 'Hosted discovery is not configured.' }); return; }
    const token = req.get('Authorization')?.replace(/^Bearer /,'') || '';
    if (!/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token),Buffer.from(serviceToken))) { res.status(401).json({ error: 'A valid service token is required.' }); return; }
    if (req.headers.origin && req.headers.origin !== `https://${req.headers.host}`) { res.status(403).json({ error: 'Origin not allowed.' }); return; }
    if (Array.isArray(req.body)) { res.status(400).json({ error: 'Send one MCP request at a time.' }); return; }
    // Package bytes can exceed the platform payload bound. Hosted discovery
    // returns metadata/instructions/manifests; the local service handles downloads.
    if (req.body?.method === 'tools/call' && req.body?.params?.name === 'get_marketplace_skill' && req.body?.params?.arguments?.include_files === true) {
      const error = { error: { code: 'LOCAL_DOWNLOAD_REQUIRED', message: 'Use the local discovery service for package downloads. Hosted discovery returns instructions and manifests.' } };
      res.json({ jsonrpc: '2.0', id: req.body.id, result: { isError: true, structuredContent: error, content: [{ type: 'text', text: JSON.stringify(error) }] } }); return;
    }
    const server = createServer(market), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req,res,req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'Discovery request failed.' }); }
  });
  app.all('/mcp', (_req,res) => { res.setHeader('Allow','POST'); res.status(405).json({ error: 'Use POST for stateless MCP requests.' }); });
  app.use((_error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction) => res.status(400).json({ error: 'Invalid request.' }));
  return app;
}
