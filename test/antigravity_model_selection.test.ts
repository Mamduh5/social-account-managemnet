import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const wrapper=fs.readFileSync(path.resolve('scripts/agent/antigravity-wrapper.cjs'),'utf8').replace(/^#!.*\n/,'');
function execute(args:string[],payload:any,response?:any){
  const calls:any[]=[],output:string[]=[],errors:string[]=[];
  const envelope={status:'SUCCESS',structured_output:{version:'agent-result.v1',status:'prepared',result:'{"original":true}',lessons:[]},usage:{total_tokens:42}};
  const fakeFs={readFileSync:()=>JSON.stringify({task:{payload}}),mkdtempSync:()=>path.join('test-temp','agy'),writeFileSync:()=>{},rmSync:()=>{}};
  const localRequire=(id:string)=>id==='fs'?fakeFs:id==='child_process'?{spawnSync:(command:string,argv:string[],options:any)=>{calls.push({command,argv,options});return response??{status:0,stdout:JSON.stringify(envelope)};}}:id.startsWith('./')?require('../scripts/agent/'+id.slice(2)):require(id);
  let exitCode=0;
  const processStub={argv:['node','wrapper',...args],exit:(code:number)=>{exitCode=code;throw new Error('EXIT');},get exitCode(){return exitCode;},set exitCode(value:number){exitCode=value;}};
  try{new Function('require','process','console',wrapper)(localRequire,processStub,{log:(s:string)=>output.push(s),error:(s:string)=>errors.push(s)});}catch(e){if((e as Error).message!=='EXIT')throw e;}
  return {calls,output,errors,exitCode};
}
for(const payload of [{production:{version:'gemini-concept.v1'}},{pageContent:{version:'page-content.v1'}}]){
  test('explicit included model reaches bounded schema route '+Object.keys(payload)[0],()=>{
    const r=execute(['--model','gemini-3.8-flash-medium'],payload);
    assert.equal(r.exitCode,0);assert.equal(r.calls.length,1);
    assert.deepEqual(r.calls[0].argv.slice(0,2),['--model','gemini-3.8-flash-medium']);
    for(const flag of ['--json-schema','--mode','--sandbox'])assert(r.calls[0].argv.includes(flag));
    assert.equal(r.calls[0].options.timeout,180000);
    assert.equal(JSON.parse(r.output[0]).usage.tokens,42);
    assert.equal(JSON.parse(r.output[0]).result,'{"original":true}');
  });
}
test('legacy writer forwards explicit model and default calls retain provider default',()=>{
  const response={status:0,stdout:JSON.stringify({status:'SUCCESS',structured_output:{version:'agent-content-result.v1',research:{sources:[]}},usage:{total_tokens:42}})};
  const selected=execute(['--model','gemini-3.8-flash-medium'],{content:{}},response);
  assert.equal(selected.exitCode,0);assert.deepEqual(selected.calls[0].argv.slice(0,2),['--model','gemini-3.8-flash-medium']);
  const original=execute([],{production:{version:'gemini-concept.v1'}});
  assert.equal(original.exitCode,0);assert(!original.calls[0].argv.includes('--model'));
});
test('quota failure makes exactly one attempt with no fallback or invented receipt',()=>{
  const r=execute(['--model','gemini-3.8-flash-medium'],{production:{version:'gemini-concept.v1'}},{status:1,stdout:'',stderr:'RESOURCE_EXHAUSTED'});
  assert.equal(r.calls.length,1);assert.equal(r.exitCode,1);assert.equal(r.output.length,0);
});
test('invalid model arguments fail before launching a process',()=>{
  for(const args of [['--model'],['--model','flash;other'],['--model','flash','--continue'],['--unknown','flash']]){
    const r=execute(args,{});assert.equal(r.exitCode,1);assert.equal(r.calls.length,0);
  }
});
