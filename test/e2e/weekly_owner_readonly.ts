/** Explicit copy-only UI inspection of existing owner metadata. No owner runtime or writes. */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

async function main(){
  if(!process.argv.includes('--owner-readonly'))throw Error('Explicit --owner-readonly required');
  const root=path.resolve(__dirname,'../..'),config=JSON.parse(fs.readFileSync(path.join(root,'.data/runtime/owner-config.json'),'utf8').replace(/^\uFEFF/,''));
  const directory=path.join(root,'.data/weekly-v11-validation','owner-copy-'+Date.now());fs.mkdirSync(directory,{recursive:true});
  const source=new Database(path.join(config.dataDir,'social_command_center.db'),{readonly:true,fileMustExist:true});
  try{await source.backup(path.join(directory,'social_command_center.db'));}finally{source.close();}
  process.env.SCC_DATA_DIR=directory;process.env.SCC_ISOLATED_TEST='true';process.env.SCC_PAUSE_WORKERS='true';
  globalThis.fetch=async()=>{throw Error('External/provider fetch is blocked in owner-copy review');};
  const {weeklyContentRouter}=await import('../../server/src/routes/weekly-content.routes.js');
  const {db}=await import('../../server/src/db/database.js');
  const app=express();app.use((req,res,next)=>{if(req.method!=='GET'){res.status(403).json({error:'Read-only review; writes are disabled'});return;}next();});
  app.use('/api/weekly-content',weeklyContentRouter);
  app.get('/api/calendar/health',(_req,res)=>res.json({status:'read_only_review',timezone:'Asia/Bangkok',activeJobs:0,scheduledJobs:0}));
  app.get('/api/events',(_req,res)=>res.type('text/event-stream').end(': read-only copy\n\n'));
  app.use('/api',(_req,res)=>res.json({accounts:[],categories:[],campaigns:[],items:[],queue:[],events:[],totals:{}}));
  app.use(express.static(path.join(root,'client/dist')));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{const page=await browser.newPage({viewport:{width:1360,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto(`http://127.0.0.1:${address.port}/`);await page.getByRole('button',{name:'Content Calendar',exact:true}).click();await page.getByText('Research-first weekly content',{exact:true}).click();await page.getByText('Create a seven-day plan',{exact:true}).click();
    for(const name of ['แก้บัคยาวๆๆ','ร้อยละคนไทย','โลกจริงหลุดบท'])await page.getByRole('checkbox',{name:new RegExp(name)}).first().waitFor();assert.deepEqual(errors,[]);
    const index=await page.request.get(`http://127.0.0.1:${address.port}/api/weekly-content`);const data=await index.json();assert.equal(data.targets.length,3);assert.ok(data.groups.length>=1);
    const denied=await page.request.post(`http://127.0.0.1:${address.port}/api/weekly-content/plans`,{data:{}});assert.equal(denied.status(),403);
    await page.screenshot({path:path.join(directory,'owner-metadata-planner.png'),fullPage:true});
    const result={status:'PASS',copyOnly:true,ownerRevision:config.releaseRevision,originalDatabaseWritten:false,providersCalled:false,weeklyWritesBlocked:true,pages:data.targets.length,groups:data.groups.length,directory};fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
