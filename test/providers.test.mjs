import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Marketplace } from '../dist/providers.js';
import { providerFetch, commit, tree } from './fixtures.mjs';

test('normalizes authenticated rankings, labels windows, and forwards pagination',async()=>{
 const log=[];const market=new Marketplace({fetch:providerFetch(log),token:async()=> 'fixture-token'});
 const ranking=await market.rankings('hot',1,10);assert.match(ranking.metric,/hourly/);assert.equal(ranking.next_page,2);assert.equal(ranking.items[0].change,8);assert.match(log[0].url,/page=1/);assert.equal(log[0].headers.Authorization,'Bearer fixture-token');
 const search=await market.search('debug');assert.equal(search.items[0].source,'owner/repo');assert.equal(search.items[0].installable,true);
 const github=await market.rankings('github-stars');assert.match(github.metric,/repository stars/);assert.equal(github.items[0].kind,'repository');assert.equal(github.items[0].installable,false);
});
test('caches success for its TTL and does not cache errors',async()=>{
 let now=1000;const log=[];const m=new Marketplace({fetch:providerFetch(log),token:async()=> 'x',now:()=>now});
 await m.search('debug');await m.search('debug');assert.equal(log.length,1);now+=61000;await m.search('debug');assert.equal(log.length,2);
});
test('missing and expired auth fail clearly without substituted data',async()=>{
 const m=new Marketplace({fetch:providerFetch()});await assert.rejects(m.rankings('most-installed'),{code:'AUTH_REQUIRED'});
 const expired=new Marketplace({token:async()=> 'expired',fetch:async()=>new Response('{}',{status:401})});await assert.rejects(expired.search('debug'),{code:'AUTH_REQUIRED'});
});
test('handles rate limits, invalid provider data and unavailable providers',async()=>{
 const limited=new Marketplace({token:async()=> 'x',fetch:async()=>new Response('{}',{status:429,headers:{'retry-after':'30'}})});await assert.rejects(limited.search('debug'),e=>e.code==='RATE_LIMITED'&&e.retry_after===30);
 const invalid=new Marketplace({token:async()=> 'x',fetch:async()=>Response.json({bad:true})});await assert.rejects(invalid.rankings('trending'),{code:'PROVIDER_UNAVAILABLE'});
 const down=new Marketplace({fetch:async()=>{throw new Error('network');}});await assert.rejects(down.rankings('github-stars'),{code:'PROVIDER_UNAVAILABLE'});
});
test('resolves exact commits and complete packages with repository attribution',async()=>{
 const log=[];const m=new Marketplace({fetch:providerFetch(log)});const result=await m.skill('owner/repo','example',commit,true);
 assert.equal((await m.repositorySkills('owner/repo',commit)).description,'A collection of practical debugging workflows.');assert.equal(result.requirements.compatibility,'Requires a shell.');assert.equal(result.requirements.allowed_tools,'Bash Read');assert.equal(result.commit,commit);assert.equal(result.standalone,true);assert.equal(result.path,'skills/example');assert.ok(result.files.some(f=>f.path==='LICENSE'));assert.ok(result.files.every(f=>f.content&&f.sha256.length===64));assert.match(result.setup_instructions,/Manual setup/);assert.ok(!log.some(l=>l.url.includes('/commits/HEAD')));
 const metadata=await m.skill('owner/repo','example',commit,false);assert.ok(metadata.files.every(f=>!('content'in f)));
});
test('rejects invalid sources, symlinked package files, oversized and truncated repositories',async()=>{
 const m=new Marketplace({fetch:providerFetch()});await assert.rejects(m.repositorySkills('../secret'),{code:'INVALID_SOURCE'});
 const links=new Marketplace({fetch:providerFetch([],{tree:[...tree,{path:'skills/example/linked',mode:'120000',type:'blob',sha:'b'.repeat(40),size:8}]})});await assert.rejects(links.skill('owner/repo','example',commit,true),{code:'INVALID_PACKAGE'});
 const big=new Marketplace({fetch:providerFetch([],{truncated:true})});await assert.rejects(big.repositorySkills('owner/repo'),{code:'REPOSITORY_TOO_LARGE'});
 const oversize=new Marketplace({fetch:providerFetch([],{tree:[...tree,{path:'skills/example/big',mode:'100644',type:'blob',sha:'b'.repeat(40),size:3*1024*1024}]})});await assert.rejects(oversize.skill('owner/repo','example',commit,true),{code:'PACKAGE_TOO_LARGE'});
});

test('preserves all-time and trending names without inventing a daily metric',async()=>{const log=[],m=new Marketplace({fetch:providerFetch(log),token:async()=> 'x'});assert.equal((await m.rankings('most-installed')).metric,'total skill installs');assert.equal((await m.rankings('trending')).metric,'provider trending install ranking');assert.match(log[0].url,/view=all-time/);assert.match(log[1].url,/view=trending/);});
test('does not cache failures and normalizes interrupted and null responses',async()=>{let attempts=0;const fetcher=providerFetch();const m=new Marketplace({token:async()=> 'x',fetch:async(...args)=>{if(++attempts===1)return new Response('{}',{status:503});return fetcher(...args);}});await assert.rejects(m.search('retry'),{code:'PROVIDER_UNAVAILABLE'});await m.search('retry');await m.search('retry');assert.equal(attempts,2);const invalid=new Marketplace({token:async()=> 'x',fetch:async()=>Response.json(null)});await assert.rejects(invalid.search('broken'),{code:'PROVIDER_UNAVAILABLE'});const interrupted=new Marketplace({token:async()=> 'x',fetch:async()=>new Response(new ReadableStream({start(c){c.error(new Error('stream interrupted'));}}))});await assert.rejects(interrupted.search('broken'),{code:'PROVIDER_UNAVAILABLE'});});
test('GitHub pagination ends at its search window and empty repositories stay empty',async()=>{const m=new Marketplace({fetch:providerFetch([],{route:u=>u.pathname==='/search/repositories'?Response.json({items:[{full_name:'owner/repo',name:'repo',stargazers_count:42}],total_count:1001}):undefined})});assert.equal((await m.rankings('github-stars',0,1)).next_page,1);assert.equal((await m.rankings('github-stars',999,1)).next_page,null);const empty=new Marketplace({fetch:providerFetch([],{tree:[]})});assert.deepEqual((await empty.repositorySkills('owner/repo')).items,[]);});
test('Trending groups repositories before pagination and counts distinct sampled skills',async()=>{
 const log=[];
 const row=(source,slug)=>({id:`${source}/${slug}`,source,slug,name:slug,installs:99,sourceType:'github'});
 const fetcher=providerFetch(log,{route:u=>u.hostname==='skills.sh'?Response.json({data:u.searchParams.get('page')==='0'?[row('mattpocock/skills','research'),row('other/tools','audit')]:[row('MattPocock/skills','research'),row('mattpocock/skills','review'),row('third/skills','build')],pagination:{hasMore:u.searchParams.get('page')==='0'}}):undefined});
 const m=new Marketplace({fetch:fetcher,token:async()=> 'fixture'});
 const first=await m.trendingCollections(0,2),second=await m.trendingCollections(1,2);
 assert.deepEqual(first.items.map(x=>x.source),['mattpocock/skills','other/tools']);assert.equal(first.items[0].trending_skill_count,2);assert.equal(first.items[0].kind,'repository');assert.equal(first.items[0].installable,false);assert.equal('installs' in first.items[0],false);assert.equal(first.next_page,1);assert.deepEqual(second.items.map(x=>x.source),['third/skills']);assert.equal(second.next_page,null);assert.equal(first.sampled_skills,5);assert.equal(first.sample_truncated,false);assert.match(first.metric,/highest-ranked skill/);assert.equal(log.length,2);assert.ok(log.every(x=>new URL(x.url).searchParams.get('per_page')==='100'));
});
test('Trending collection discovery bounds its provider scan and shares a cached snapshot',async()=>{const log=[],m=new Marketplace({fetch:providerFetch(log),token:async()=> 'fixture'});const first=await m.trendingCollections();assert.equal(log.length,5);assert.equal(first.sample_truncated,true);assert.equal(first.items[0].trending_skill_count,1);await m.trendingCollections(1);assert.equal(log.length,5);});

test('reuses immutable skill blobs after repository metadata refreshes',async()=>{
 let now=1000;const log=[];const m=new Marketplace({fetch:providerFetch(log),now:()=>now});
 await m.repositorySkills('owner/repo');const first=log.filter(x=>x.url.includes('/git/blobs/')).length;
 now+=301000;await m.repositorySkills('owner/repo');
 assert.equal(log.filter(x=>x.url.includes('/commits/HEAD')).length,2);
 assert.equal(log.filter(x=>x.url.includes('/git/blobs/')).length,first);
 now+=86400000;await m.repositorySkills('owner/repo');
 assert.equal(log.filter(x=>x.url.includes('/git/blobs/')).length,first*2);
});

for (const view of ['most-installed','hot']) test(`${view} groups across provider pages with its own ranking and pagination`,async()=>{
 const log=[];const row=(source,slug)=>({id:`${source}/${slug}`,source,slug,name:slug,installs:12,sourceType:'github'});
 const m=new Marketplace({token:async()=> 'fixture',fetch:providerFetch(log,{route:u=>u.hostname==='skills.sh'?Response.json({data:u.searchParams.get('page')==='0'?[row('owner/first','one'),row('other/second','two')]:[row('owner/first','three'),row('last/third','four')],pagination:{hasMore:u.searchParams.get('page')==='0'}}):undefined})});
 const first=await m.rankingCollections(view,0,2),last=await m.rankingCollections(view,1,2);
 assert.deepEqual(first.items.map(x=>x.source),['owner/first','other/second']);assert.equal(first.items[0].sampled_skill_count,2);assert.equal(first.items[0].kind,'repository');assert.equal(first.items[0].installable,false);assert.equal('installs' in first.items[0],false);assert.equal('trending_skill_count' in first.items[0],false);assert.equal(first.next_page,1);assert.equal(last.items[0].source,'last/third');assert.equal(last.next_page,null);assert.equal(first.sampled_skills,4);assert.equal(log.length,2);
 assert.ok(log.every(x=>new URL(x.url).searchParams.get('view')===(view==='most-installed'?'all-time':'hot')));assert.match(first.metric,view==='hot'?/hourly installs.*same hour yesterday/:/total skill installs/);
 // A different view must not reuse the cached collection snapshot.
 await m.rankingCollections('trending');assert.equal(log.length,4);
});
test('search groups bounded matches, preserves first-match order, and paginates collections',async()=>{
 const log=[];const row=(source,slug,sourceType='github')=>({id:`${source}/${slug}`,source,slug,name:slug,sourceType});
 const m=new Marketplace({token:async()=> 'fixture',fetch:providerFetch(log,{route:u=>u.hostname==='skills.sh'?Response.json({data:[row('owner/first','one'),row('other/second','two'),row('Owner/first','one'),row('owner/first','three'),row('last/third','four'),row('external/source','five','gitlab')]}):undefined})});
 const first=await m.searchCollections('debug',0,2),last=await m.searchCollections('debug',1,2);
 assert.deepEqual(first.items.map(x=>x.source),['owner/first','other/second']);assert.equal(first.items[0].sampled_skill_count,2);assert.equal(first.next_page,1);assert.equal(last.items[0].source,'last/third');assert.equal(last.next_page,null);assert.equal(first.sample_limit,50);assert.equal(first.sampled_skills,6);assert.match(first.metric,/first matching skill/);assert.equal(log.length,1);assert.equal(new URL(log[0].url).searchParams.get('limit'),'50');assert.ok(first.items.every(x=>x.kind==='repository'&&!x.installable&&!('installs' in x)));
 await m.searchCollections('design');assert.equal(log.length,2);
});
test('grouped GitHub uses native repository pagination and grouped provider errors propagate',async()=>{
 const log=[];const m=new Marketplace({fetch:providerFetch(log)});const result=await m.rankingCollections('github-stars',0,1);assert.equal(result.items[0].stars,42);assert.equal('sampled_skill_count' in result.items[0],false);assert.equal(log.length,1);assert.match(log[0].url,/per_page=1/);
 await assert.rejects(m.rankingCollections('most-installed'),{code:'AUTH_REQUIRED'});await assert.rejects(m.searchCollections('debug'),{code:'AUTH_REQUIRED'});
 const empty=new Marketplace({token:async()=> 'fixture',fetch:async()=>Response.json({data:[],pagination:{hasMore:false}})});assert.deepEqual((await empty.rankingCollections('hot')).items,[]);assert.equal((await empty.searchCollections('missing')).next_page,null);
});
