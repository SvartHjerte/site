const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function browser() {
  const posts=[], events={}; let signIns=0, session=null;
  const context=vm.createContext({console,setInterval(){},
    browserLock:{supported:true,request:async(_n,_t,fn)=>fn()},
    document:{hidden:false},window:{addEventListener:(n,f)=>events[n]=f},
    people:[],updateRankings(){},loadLists(){},renderLists(){},
    sdk:{auth:{getSession:async()=>({data:{session}}), signInAnonymously:async()=>{
      signIns++;session={access_token:'visitor-token'};return {data:{session}};
    }}},
    fetch:async(url,options)=>{if(options?.method==='POST') posts.push(url);return {ok:true,json:async()=>({rankings:[]})};}
  });
  vm.runInContext(readFileSync(join(__dirname,'../js/rankings.js'),'utf8').replace(
    "const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0');",'const createClient = () => sdk;'),context);
  return {context,posts,run:code=>vm.runInContext(code,context),get signIns(){return signIns;}};
}
test('loading and editing lists never writes votes or creates an anonymous identity',async()=>{
  const b=browser();await b.run('rankingSync.start()');b.run('rankingSync.changed()');
  assert.equal(b.signIns,0);assert.deepEqual(b.posts,[]);assert.match(b.run('rankingSync.message'),/Generate a PDF/);
});
test('PDF preparation reuses the authenticated identity and does not record votes itself',async()=>{
  const b=browser();assert.equal(await b.run('rankingSync.preparePDF()'),'Bearer visitor-token');
  assert.equal(await b.run('rankingSync.preparePDF()'),'Bearer visitor-token');
  assert.equal(b.signIns,1);assert.deepEqual(b.posts,[]);
});
test('failed ranking setup preserves PDF generation and reports that choices were not counted',async()=>{
  const b=browser();b.context.fetch=async()=>({ok:false});
  assert.equal(await b.run('rankingSync.preparePDF()'),null);
  b.run('rankingSync.pdfCompleted(false)');assert.match(b.run('rankingSync.message'),/could not be counted/);
  assert.equal(b.signIns,0);assert.deepEqual(b.posts,[]);
});
