import path from 'node:path';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';

// Deliberate local fixture review; this launcher never opens the owner database.
const root=path.resolve(__dirname,'..');
const review=path.join(root,'.data','v110-review');
fs.mkdirSync(path.join(review,'app'),{recursive:true});
const emptyEnv=path.join(review,'empty.env');fs.writeFileSync(emptyEnv,'');
const keyFile=path.join(review,'synthetic-key.txt');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32).toString('base64'),{flag:'wx'});
const key=fs.readFileSync(keyFile,'utf8').trim();if(Buffer.from(key,'base64').length!==32)throw new Error('Invalid isolated review key');
const providerIndex=process.argv.indexOf('--provider-config');
const providerConfig=providerIndex>=0?process.argv[providerIndex+1]:undefined;
if(providerIndex>=0&&!providerConfig)throw new Error('--provider-config requires a local configuration path');
if(providerConfig&&process.argv.includes('--fixtures'))throw new Error('Choose real provider configuration or fixtures, not both');
const env={...process.env};
delete env.SCC_ASSISTANT_PROVIDER_CONFIG;
for(const name of Object.keys(env))if(/^(META_|TIKTOK_|OPENAI_|GEMINI_|ANTHROPIC_|OPENROUTER_)/.test(name))delete env[name];
Object.assign(env,{DOTENV_CONFIG_PATH:emptyEnv,SCC_DATA_DIR:path.join(review,'app'),SCC_CLIENT_DIST:path.join(review,'app-client-dist'),SCC_CLIENT_BUILD_DIR:path.join(review,'app-client-dist'),SCC_ISOLATED_TEST:'true',SCC_ASSISTANT_FIXTURES:process.argv.includes('--fixtures')?'true':'false',SCC_SEED_DEMOS:'true',SCC_TOKEN_ENCRYPTION_KEY:key,PORT:'3195'});
if(providerConfig)env.SCC_ASSISTANT_PROVIDER_CONFIG=path.resolve(providerConfig);
if(!process.argv.includes('--no-build')){
  const build=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm run build:client'],{cwd:root,env,stdio:'inherit',windowsHide:true}):spawnSync('npm',['run','build:client'],{cwd:root,env,stdio:'inherit'});
  if(build.status!==0)process.exit(build.status||1);
}
if(process.argv.includes('--check')){console.log('Isolated configuration prepared; no server started.');process.exit(0);}
console.log('V1.10 isolated review: http://127.0.0.1:3195. Social providers blocked; review workers paused.');
console.log(providerConfig?'Assistant: explicitly configured Free-tier text provider, draft generation only.':process.argv.includes('--fixtures')?'Assistant: labeled test fixtures, not AI output.':'Assistant: unavailable; manual drafts only.');
const child=spawn(process.execPath,['--import','tsx','test/e2e/v110_review_server.ts'],{cwd:root,env,stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
child.once('close',code=>{process.exitCode=code||0;});
