import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createHostedApp} from '../dist/hosted-http.js';
import {Marketplace} from '../dist/providers.js';
import {providerFetch} from './fixtures.mjs';
const token='a'.repeat(64);
async function listen(app){return await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.on('error',reject);});}
test('hosted discovery requires a service credential on every call and reports no secrets in health',async()=>{
 const server=await listen(createHostedApp(new Marketplace({fetch:providerFetch(),token:async()=> 'fixture'}),token));const base=`http://127.0.0.1:${server.address().port}`;const client=new Client({name:'hosted-test',version:'1'});
 try{assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+'é'.repeat(64),'Content-Type':'application/json'},body:'{}'})).status,401);const health=await(await fetch(base+'/health')).json();assert.equal(health.authentication_required,true);assert.ok(!JSON.stringify(health).includes(token));await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));assert.equal((await client.listTools()).tools.length,4);const ranking=await client.callTool({name:'list_rankings',arguments:{view:'trending',group_by:'repository'}});assert.notEqual(ranking.isError,true);assert.equal(ranking.structuredContent.items[0].kind,'repository');const skill=await client.callTool({name:'get_marketplace_skill',arguments:{source:'owner/repo',skill:'example'}});assert.notEqual(skill.isError,true);assert.ok(skill.structuredContent.instructions);const download=await client.callTool({name:'get_marketplace_skill',arguments:{source:'owner/repo',skill:'example',include_files:true}});assert.equal(download.structuredContent.error.code,'LOCAL_DOWNLOAD_REQUIRED');assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'})).status,403);
 }finally{await client.close();await new Promise(r=>server.close(r));}
});
test('unconfigured hosted discovery fails closed',async()=>{const server=await listen(createHostedApp(undefined,''));try{const r=await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,503);}finally{await new Promise(r=>server.close(r));}});
