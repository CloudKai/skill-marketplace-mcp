import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { Marketplace } from '../dist/providers.js';
import { startHttp } from '../dist/http.js';
import { providerFetch,commit } from './fixtures.mjs';

test('real SDK discovers exactly four read-only tools and retrieves pinned package over HTTP',async()=>{
 const server=await startHttp(new Marketplace({fetch:providerFetch(),token:async()=> 'fixture'}),0);
 const base=`http://127.0.0.1:${server.address().port}`;const client=new Client({name:'test',version:'1'});
 try {await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));const tools=await client.listTools();assert.equal(tools.tools.length,4);assert.ok(tools.tools.every(t=>t.annotations.readOnlyHint));
 for(const [name,args] of [['search_marketplace',{query:'debug'}],['list_rankings',{view:'hot',page:50}],['list_repository_skills',{source:'owner/repo'}],['get_marketplace_skill',{source:'owner/repo',skill:'example',commit,include_files:true}]]){const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true);assert.ok(result.structuredContent);}
 const grouped=await client.callTool({name:'list_rankings',arguments:{view:'trending',group_by:'repository',limit:1}});assert.equal(grouped.structuredContent.items[0].kind,'repository');for(const view of ['most-installed','hot','github-stars']){const result=await client.callTool({name:'list_rankings',arguments:{view,group_by:'repository'}});assert.notEqual(result.isError,true);assert.equal(result.structuredContent.items[0].kind,'repository');}
 const search=await client.callTool({name:'search_marketplace',arguments:{query:'debug',group_by:'repository'}});assert.equal(search.structuredContent.items[0].kind,'repository');const nextSearch=await client.callTool({name:'search_marketplace',arguments:{query:'debug',group_by:'repository',page:1}});assert.deepEqual(nextSearch.structuredContent.items,[]);const invalidSearch=await client.callTool({name:'search_marketplace',arguments:{query:'debug',page:1}});assert.equal(invalidSearch.structuredContent.error.code,'INVALID_INPUT');
 assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'})).status,403);
 }finally{await client.close();await new Promise(r=>server.close(r));}
});
test('stdio SDK connection initializes and reports missing credentials without internet',async()=>{
 const client=new Client({name:'stdio-test',version:'1'});try{await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/stdio.js',import.meta.url))],env:{PATH:process.env.PATH},stderr:'pipe'}));assert.equal((await client.listTools()).tools.length,4);const r=await client.callTool({name:'list_rankings',arguments:{view:'most-installed'}});assert.equal(r.isError,true);assert.equal(r.structuredContent.error.code,'AUTH_REQUIRED');}finally{await client.close();}
});
