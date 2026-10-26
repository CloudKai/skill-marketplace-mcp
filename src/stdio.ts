import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Marketplace } from './providers.js';
import { createServer } from './server.js';
import { rankingToken } from './auth.js';
await createServer(new Marketplace({ token: rankingToken, githubToken: process.env.GITHUB_TOKEN })).connect(new StdioServerTransport());
console.error('Skill Marketplace MCP ready (read-only, stdio).');
