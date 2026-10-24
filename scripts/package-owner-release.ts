import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {fingerprint,readJson,writeJson,privateDirectory,validateOwnerConfiguration,type OwnerConfiguration} from './lib/owner-runtime-core.js';
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);function option(name:string){const i=args.indexOf(name);return i<0?undefined:args[i+1];}
function git(args:string[],binary=false):any{return execFileSync('git',args,{cwd:root,encoding:binary?undefined:'utf8',windowsHide:true,maxBuffer:20_000_000});}
function inputTree(){const files=git(['ls-files','--cached','--others','--exclude-standard','--','client','package.json','package-lock.json']).trim().split(/\r?\n/).filter(Boolean).sort();return Object.fromEntries(files.map((file:string)=>[file,git(['hash-object','--path',file,path.join(root,file)]).trim()]));}
function copy(source:string,target:string,hashes:Record<string,string>,prefix:string){fs.mkdirSync(target,{recursive:true});for(const item of fs.readdirSync(source,{withFileTypes:true})){if(item.isSymbolicLink())throw new Error('Release bundles cannot contain symlinks');if(item.isDirectory())copy(path.join(source,item.name),path.join(target,item.name),hashes,prefix+'/'+item.name);else{const bytes=fs.readFileSync(path.join(source,item.name));fs.writeFileSync(path.join(target,item.name),bytes,{flag:'wx'});hashes[prefix+'/'+item.name]=fingerprint(bytes);}}}
function main(){
 const capture=option('--capture-input');if(capture){writeJson(path.resolve(capture),{capturedAt:new Date().toISOString(),inputs:inputTree()});console.log('Client source input fingerprint captured.');return;}
 const revision=option('--revision'),bundle=option('--client-dir'),inputFile=option('--build-input');
 if(!revision||!/^[a-f0-9]{40}$/.test(revision)||!bundle||!inputFile)throw new Error('Provide exact --revision, --client-dir and --build-input');
 const input=readJson(inputFile).inputs;if(JSON.stringify(input)!==JSON.stringify(inputTree()))throw new Error('Client source changed after the tested build');
 const committed=Object.fromEntries(git(['ls-tree','-r',revision,'--','client','package.json','package-lock.json']).trim().split(/\r?\n/).filter(Boolean).map((line:string)=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]];}).sort((a:any,b:any)=>a[0].localeCompare(b[0],'en')));
 if(Object.keys(input).length!==Object.keys(committed).length||Object.entries(input).some(([name,hash])=>committed[name]!==hash))throw new Error('The built client inputs are not exactly the selected commit');
 if(!fs.existsSync(path.join(bundle,'index.html')))throw new Error('Built client bundle missing');
 const releaseRoot=path.join(root,'.data','releases',revision);if(fs.existsSync(releaseRoot))throw new Error('Release already exists; do not overwrite pinned assets');privateDirectory(path.dirname(releaseRoot));fs.mkdirSync(releaseRoot);
 const files=git(['ls-tree','-r','--name-only',revision,'--','server/src','scripts','package.json','package-lock.json','tsconfig.json','tsconfig.operations.json']).trim().split(/\r?\n/).filter(Boolean);const hashes:Record<string,string>={};
 for(const file of files){const bytes=git(['show',revision+':'+file],true);const target=path.join(releaseRoot,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});hashes[file]=fingerprint(bytes);}
 copy(path.resolve(bundle),path.join(releaseRoot,'client'),hashes,'client');writeJson(path.join(releaseRoot,'release.json'),{revision,packagedAt:new Date().toISOString(),clientInputFingerprint:fingerprint(JSON.stringify(input)),hashes});
 const runtimeDir=path.join(root,'.data','runtime');privateDirectory(runtimeDir);
 const c:OwnerConfiguration={workspaceRoot:root,releaseRoot,releaseRevision:revision,dataDir:path.join(root,'.data'),envFile:path.join(root,'.env'),clientDist:path.join(releaseRoot,'client'),providerConfig:path.join(root,'.data','v110-recovery','provider.json'),nodePath:fs.realpathSync(process.execPath),runtimeDir};validateOwnerConfiguration(c);writeJson(path.join(runtimeDir,'owner-config.json'),c);
 console.log(JSON.stringify({revision,releaseRoot,sourceAndAssetFiles:Object.keys(hashes).length,ownerConfigured:true},null,2));
}
try{main();}catch(error:any){console.error(error.message);process.exitCode=1;}
