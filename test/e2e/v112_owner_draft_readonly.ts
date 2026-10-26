/** Owner UI observation only: abort every mutation and external browser request. */
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
async function main(){
 const base='http://127.0.0.1:3001',out=path.resolve('.data/v112-owner');
 const prepared=JSON.parse(fs.readFileSync(path.join(out,'prepared-drafts.json'),'utf8'));
 const draft=prepared.testDraft;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const blocked:string[]=[];
  await page.route('**/*',route=>{
   const req=route.request();
   if(!req.url().startsWith(base+'/') || !['GET','HEAD'].includes(req.method())){blocked.push(req.method()+' '+new URL(req.url()).origin);return route.abort();}
   return route.continue();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Publishing Center',exact:true}).click();
  await page.getByLabel('Post type',{exact:true}).selectOption('text');
  await page.getByRole('button',{name:'Load draft '+draft.title,exact:true}).click();
  await page.getByLabel('Draft title',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Draft title',{exact:true}).inputValue(),draft.title);
  assert.equal(await page.getByLabel('Caption for แก้บัคยาวๆๆ',{exact:true}).inputValue(),draft.destinations[0].caption);
  assert.equal(await page.getByLabel('Hashtags for แก้บัคยาวๆๆ',{exact:true}).inputValue(),draft.destinations[0].hashtags);
  assert.equal(await page.getByLabel('Select Page destination แก้บัคยาวๆๆ',{exact:true}).isChecked(),true);
  assert.equal(await page.getByLabel('Select Page destination โลกจริงหลุดบท',{exact:true}).isChecked(),false);
  assert.equal(await page.getByLabel('Prepare scheduled draft',{exact:true}).isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'Queue Approved Draft',exact:true}).isDisabled(),true);
  await page.screenshot({path:path.join(out,'first-test-draft.png'),fullPage:true});
  const receipt={status:'PASS',ownerObservationOnly:true,draftId:draft.id,revision:draft.revision,checks:['Exact title/caption/hashtags visible','Only Page A selected','Unscheduled','Queue disabled before approval'],blockedRequests:blocked};
  fs.writeFileSync(path.join(out,'browser-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
