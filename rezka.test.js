'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createProbe}=require('./rezka');
const LOGIN='<form id="loginForm"><input type="password"></form>';
const FILM='<div class="b-content__main" data-id="93568">Gladiator</div>';
function response(text,status=200,headers={}) { return new Response(text,{status,headers}); }

test('expired sessions recover once, share recovery and respect cooldown',async()=>{
  let time=100000,expired=false,logins=0;
  const probe=createProbe({login:'user',password:'password',now:()=>time,fetchImpl:async(url)=>{
    if(url.includes('/ajax/login/')) {logins++;expired=false;return response('{"success":true}');}
    if(expired) return response(LOGIN);
    if(url.includes('/search/')) return response('<div class="b-content__inline_items"></div>');
    return response(FILM);
  }});
  await probe.run();expired=true;
  await probe.search('one');assert.equal(logins,1);
  expired=true;
  await assert.rejects(probe.search('two'),/SESSION_EXPIRED/);assert.equal(logins,1);
  time+=61000;
  await Promise.all([probe.search('three'),probe.search('four').catch(error=>{assert.equal(error.message,'WAIT_AND_RETRY');})]);
  assert.equal(logins,2);
});

test('recovery never repeatedly submits rejected credentials',async()=>{
  let expired=false,logins=0;
  const probe=createProbe({login:'user',password:'password',fetchImpl:async url=>{
    if(url.includes('/ajax/login/')) {logins++;return response('{"success":false}');}
    return response(expired?LOGIN:FILM);
  }});
  await probe.run();expired=true;
  await assert.rejects(probe.search('one'),/LOGIN_REJECTED/);
  await assert.rejects(probe.search('two'),/LOGIN_REJECTED/);
  assert.equal(logins,1);
});
test('anonymous login gate and HTTP failures are distinct',async()=>{
  for(const [reply,code] of [[response(LOGIN),'AUTH_REQUIRED'],[response('',403),'BLOCKED'],[response('',429),'RATE_LIMITED'],[response('<html>unknown</html>'),'PAGE_UNRECOGNIZED']]) {
    const probe=createProbe({fetchImpl:async()=>reply});
    assert.equal((await probe.run()).code,code);
  }
});
test('confirmed login form contract, cookie use, no secrets in status, no automatic repeat',async()=>{
  let calls=[];
  const probe=createProbe({login:'private@example.org',password:'secret-password',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1) return response(LOGIN,200,{'Set-Cookie':'pre=one; Path=/; Secure'});
    if(calls.length===2) return response('{"success":true}',200,{'Set-Cookie':'session=private-cookie; Path=/; Secure; HttpOnly'});
    return response(FILM);
  }});
  const status=await probe.run();
  assert.equal(status.code,'PAGE_AVAILABLE');
  assert.equal(status.streamReady,false);
  assert.equal(calls[1].url,'https://rezka.si/ajax/login/');
  assert.equal(new URLSearchParams(calls[1].options.body).get('login_name'),'private@example.org');
  assert.equal(calls[1].options.headers.Cookie,'pre=one');
  assert.match(calls[2].options.headers.Cookie,/session=private-cookie/);
  assert.doesNotMatch(JSON.stringify(probe.status()),/secret-password|private-cookie|private@example/);
  await probe.run();assert.equal(calls.length,3);
});
test('rejected credentials are attempted only once and upstream errors are not exposed',async()=>{
  let n=0;
  const probe=createProbe({login:'user',password:'password',fetchImpl:async()=>++n===1?response(LOGIN):response('{"success":false,"message":"sensitive value"}')});
  assert.equal((await probe.run()).code,'LOGIN_REJECTED');
  await probe.run();assert.equal(n,2);
  assert.doesNotMatch(JSON.stringify(probe.status()),/sensitive value/);
});
test('redirect to another origin never gets credentials or session cookies',async()=>{
  let n=0;
  const probe=createProbe({login:'user',password:'password',fetchImpl:async()=>{n++;return response('',302,{Location:'https://evil.invalid/','Set-Cookie':'session=secret; Path=/'});}});
  assert.equal((await probe.run()).code,'REDIRECT_REJECTED');
  assert.equal(n,1);
});
test('success response does not prove film access',async()=>{
  let n=0;
  const probe=createProbe({login:'user',password:'password',fetchImpl:async()=>++n===2?response('{"success":true}'):response(LOGIN)});
  assert.equal((await probe.run()).code,'LOGIN_REQUIRED_AFTER_SUCCESS');
});
