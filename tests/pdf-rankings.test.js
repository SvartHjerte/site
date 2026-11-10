const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recordPDFChoices}=require('../lib/pdf-rankings');
const visitorId='11111111-1111-4111-8111-111111111111';
const req={headers:{origin:'https://www.thecheatlist.com',authorization:'Bearer token'}};
function setup(){Object.assign(process.env,{RANKINGS_ENABLED:'true',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SERVICE_ROLE_KEY:'private-server-key',SITE_ORIGIN:req.headers.origin});}
test('records only the chosen PDF type and never sends partner names or signatures to Supabase',async()=>{
 setup();const original=global.fetch;const outgoing=[];
 try{
  global.fetch=async(url,options)=>{
   if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:visitorId,is_anonymous:true})};
   const body=options?.body?JSON.parse(options.body):null;if(body)outgoing.push({url,body});
   if(url.includes('/celebrity_sources?'))return {ok:true,json:async()=>[{celebrities:{name:'Trusted celebrity',category:'other',image:'',subtitle:'Actor'}}]};
   return {ok:true,json:async()=>({status:'ok'})};
  };
  const body={herName:'PRIVATE_NAME',signature:'PRIVATE_SIGNATURE',herList:[{id:'tmdb-1',name:'PRIVATE_METADATA'}],hisList:[{id:'tmdb-2'}]};
  for(const type of ['her','his','couples']){
   assert.equal(await recordPDFChoices(req,body,type),'counted');
   const payload=outgoing.at(-1).body;
   assert.equal(payload.p_visitor,visitorId);
   assert.deepEqual(payload.p_items.map(i=>i.provider_id),type==='her'?['1']:type==='his'?['2']:['1','2']);
   assert.ok(!JSON.stringify(outgoing).includes('PRIVATE_'));
  }
  assert.equal(await recordPDFChoices({headers:{}},body,'her'),'not_requested');
  await assert.rejects(recordPDFChoices({headers:{...req.headers,origin:'https://other.test'}},body,'her'),e=>e.status===403);
 }finally{global.fetch=original;}
});
test('a rate-limited PDF never invokes the vote recorder',async()=>{
 setup();const original=global.fetch;
 try{
  global.fetch=async url=>{
   if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:visitorId,is_anonymous:true})};
   assert.ok(url.endsWith('/selection_sync_gate'));return {ok:true,json:async()=>({status:'rate_limited'})};
  };
  await assert.rejects(recordPDFChoices(req,{herList:[{id:'tmdb-1'}]},'her'),e=>e.status===429);
 }finally{global.fetch=original;}
});
