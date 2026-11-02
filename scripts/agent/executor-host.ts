// Separate bounded supervisor: survives the runner's unexpected death long enough to stop its child.
import {runProcess,ExecutionError} from './executors.js';
let raw='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>131072)process.exit(2);});
process.stdin.on('end',async()=>{
  const controller=new AbortController();
  process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
  process.stdout.on('error',()=>controller.abort());
  const request=JSON.parse(raw);
  const parent=setInterval(()=>{try{process.kill(request.parentPid,0);}catch{controller.abort();}},500);
  try{
    const output=await runProcess(request.command,request.args,{...request.options,signal:controller.signal});
    process.stdout.write(JSON.stringify({ok:true,output}));
  }catch(error){process.stdout.write(JSON.stringify({ok:false,code:error instanceof ExecutionError?error.code:'supervisor_failure',definitelyNotStarted:error instanceof ExecutionError&&error.definitelyNotStarted}));}
  finally{clearInterval(parent);}
});
