import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export interface OwnerConfiguration {workspaceRoot:string;releaseRoot:string;releaseRevision:string;dataDir:string;envFile:string;clientDist:string;providerConfig:string;nodePath:string;runtimeDir:string;}
export interface OwnedProcess {pid:number;startedAt:string;entrypoint:string;}
export interface OwnerState {releaseRevision:string;instanceId:string;backend?:OwnedProcess;proxy?:OwnedProcess;}
export function readJson(file:string){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
export function writeJson(file:string,value:unknown){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
export function fingerprint(value:string|Buffer){return createHash('sha256').update(value).digest('hex');}
export function validateOwnerConfiguration(c:OwnerConfiguration){
 for(const key of ['workspaceRoot','releaseRoot','dataDir','envFile','clientDist','providerConfig','nodePath','runtimeDir'] as const)if(!path.isAbsolute(c[key]))throw new Error('Owner configuration paths must be absolute');
 if(!/^[a-f0-9]{40}$/.test(c.releaseRevision))throw new Error('Owner release must be an exact committed revision');
 const root=path.resolve(c.workspaceRoot),inside=(p:string)=>path.resolve(p).toLowerCase().startsWith((root+path.sep).toLowerCase());
 if(![c.releaseRoot,c.dataDir,c.envFile,c.clientDist,c.runtimeDir,c.providerConfig].every(inside)||path.resolve(c.dataDir)!==path.join(root,'.data')||path.resolve(c.envFile)!==path.join(root,'.env')||path.resolve(c.runtimeDir)!==path.join(root,'.data','runtime')||path.resolve(c.clientDist)!==path.join(c.releaseRoot,'client'))throw new Error('Owner configuration must use the original database/environment and a separate release bundle');
 if(path.resolve(c.releaseRoot)!==path.join(root,'.data','releases',c.releaseRevision))throw new Error('Release path does not match its revision');
}
export function currentUserSid(){const value=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();if(!/^S-1-5-[0-9-]+$/.test(value))throw new Error('Could not identify the current Windows user');return value;}
export function privateDirectory(directory:string){fs.mkdirSync(directory,{recursive:true});if(process.platform==='win32'){const sid=currentUserSid();execFileSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'pipe'});}else fs.chmodSync(directory,0o700);}
export function processIdentity(pid:number):{pid:number;startedAt:string;command:string}|null{
 if(!Number.isInteger(pid)||pid<=0)return null;
 const script='$p=Get-CimInstance Win32_Process -Filter "ProcessId='+pid+'"; if($p){[pscustomobject]@{pid=$p.ProcessId;startedAt=$p.CreationDate.ToUniversalTime().ToString("o");command=$p.CommandLine}|ConvertTo-Json -Compress}';
 const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true}).trim();return result?JSON.parse(result):null;
}
export function isOwnedProcess(expected:OwnedProcess,actual:ReturnType<typeof processIdentity>){return !!actual&&actual.pid===expected.pid&&Date.parse(actual.startedAt)===Date.parse(expected.startedAt)&&actual.command.replaceAll('/','\\').toLowerCase().includes(expected.entrypoint.replaceAll('/','\\').toLowerCase());}
export function redactRuntimeLog(value:string){return value.replace(/Bearer\s+[^\s]+/gi,'Bearer [REDACTED]').replace(/((?:api[-_]?key|access_token|refresh_token|password|client_secret|x-scc-runtime-control)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');}
export function startupScript(c:OwnerConfiguration){
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 const script=path.join(c.releaseRoot,'scripts','owner-runtime.ts');
 const command='"'+c.nodePath+'" --import tsx "'+script+'" start --config "'+path.join(c.runtimeDir,'owner-config.json')+'"';
 return 'REM Social Command Center current-user startup; owner only\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = '+quote(c.workspaceRoot)+'\r\nshell.Run '+quote(command)+', 0, False\r\n';
}
