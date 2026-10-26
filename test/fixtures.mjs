import { createHash } from 'node:crypto';
export const commit = 'a'.repeat(40);
const bytes = {
 'skills/example/SKILL.md': Buffer.from('---\nname: example\ndescription: A debugging workflow for test fixtures.\ncompatibility: Requires a shell.\nallowed-tools: Bash Read\n---\n\nRead references/checklist.md.\n'),
 'skills/example/references/checklist.md': Buffer.from('Reproduce the failure before editing.\n'),
 'LICENSE': Buffer.from('Fixture license; safe synthetic content.\n'),
 'README.md': Buffer.from('# Fixture repository\n\nManual setup: read the skill. No scripts are run.\n'),
};
export const sha = b => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
export const tree = Object.entries(bytes).map(([path,b])=>({path,type:'blob',mode:'100644',sha:sha(b),size:b.length}));
export function providerFetch(log = [], overrides = {}) {
 return async (url, options) => {
  const u=new URL(url);log.push({url:String(url),headers:options?.headers});
  if(overrides.route) {const result=await overrides.route(u,options);if(result)return result;}
  let data;
  if(u.hostname==='skills.sh') {data=u.pathname.endsWith('/search')?{data:[{id:'owner/repo/example',source:'owner/repo',slug:'example',name:'example',installs:125,sourceType:'github'}]}:{data:[{id:'owner/repo/example',source:'owner/repo',slug:'example',name:'example',installs:25,change:8,installsYesterday:17}],pagination:{hasMore:true}};}
  else if(u.pathname==='/search/repositories')data={items:[{full_name:'owner/repo',name:'repo',stargazers_count:42,description:'Synthetic test collection'}],total_count:1};
  else if(u.pathname==='/repos/owner/repo')data={private:false,stargazers_count:42,description:'A collection of practical debugging workflows.'};
  else if(u.pathname.endsWith('/commits/HEAD'))data={sha:commit};
  else if(u.pathname.includes('/git/trees/'))data={tree:overrides.tree??tree,truncated:overrides.truncated??false};
  else if(u.pathname.includes('/git/blobs/')){const b=Object.values(bytes).find(b=>sha(b)===u.pathname.split('/').pop());if(!b)return new Response('{}',{status:404});data={encoding:'base64',content:b.toString('base64')};}
  else return new Response('{}',{status:404});
  return Response.json(data);
 };
}
