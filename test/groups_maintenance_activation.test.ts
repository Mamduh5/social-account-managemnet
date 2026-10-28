import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {applyGroupsMaintenance, assertGroupsRehearsal, type GroupsMaintenanceOperations, type GroupsMaintenancePlan} from '../scripts/lib/groups-maintenance-activation.js';
import {assertGroupsMaintenanceRelease} from '../scripts/lib/groups-maintenance.js';
import {assertNoSchemaChange, configurationFingerprint, OwnerMaintenanceError, type OwnerReleaseManifest} from '../scripts/lib/owner-release-core.js';
import type {OwnerConfiguration} from '../scripts/lib/owner-runtime-core.js';
import {fingerprint} from '../scripts/lib/owner-runtime-core.js';
import {groupsMigrationSourceFiles} from '../scripts/prepare-groups-migration.js';

function fixture() {
  const root=path.join(os.tmpdir(),'groups-maintenance-controller-fixture'),revision='a'.repeat(40),next='b'.repeat(40);
  const current: OwnerConfiguration={workspaceRoot:root,releaseRoot:path.join(root,'.data','releases',revision),releaseRevision:revision,dataDir:path.join(root,'.data'),envFile:path.join(root,'.env'),runtimeDir:path.join(root,'.data','runtime'),providerConfig:path.join(root,'.data','provider.json'),nodePath:process.execPath,clientDist:path.join(root,'.data','releases',revision,'client')};
  const candidate={...current,releaseRevision:next,releaseRoot:path.join(root,'.data','releases',next),clientDist:path.join(root,'.data','releases',next,'client')};
  const previous: OwnerReleaseManifest={revision,hashes:{'server/src/db/content-workspace-schema.ts':'old'}};
  const proposed: OwnerReleaseManifest={revision:next,hashes:{'server/src/db/content-workspace-schema.ts':'new','server/src/db/groups-schema.ts':'groups','server/src/domain/groups.ts':'domain'}};
  const plan: GroupsMaintenancePlan={authorized:true,current,candidate,expectedConfigurationFingerprint:configurationFingerprint(current)};
  const events: string[]=[],records: Record<string,unknown>[]=[];
  let live=current;
  const ops: GroupsMaintenanceOperations={
    acquire:()=>{events.push('acquire');return()=>{events.push('release');};},
    readConfiguration:()=>live,
    verify:configuration=>configuration.releaseRevision===revision?previous:proposed,
    assertStopped:async()=>{events.push('assertStopped');},
    backup:async()=>{events.push('backup');return {integrity:'ok'};},
    migrate:()=>{events.push('migrate');return {originalTablesUnchanged:true};},
    promote:configuration=>{events.push('promote');live=configuration;},
    refreshStartup:()=>{events.push('refreshStartup');},
    record:event=>{records.push(event);events.push(String(event.status));},
  };
  return {plan,ops,events,records,previous,proposed,current,candidate,changeConfiguration:()=>{live={...current,providerConfig:path.join(root,'.data','changed.json')};}};
}

test('ordinary update/rollback keeps rejecting schema changes; dedicated Groups maintenance accepts only its additive files',()=>{
  const f=fixture();
  assert.throws(()=>assertNoSchemaChange(f.previous,f.proposed),/separate schema maintenance/);
  assert.doesNotThrow(()=>assertGroupsMaintenanceRelease(f.previous,f.proposed));
  assert.throws(()=>assertGroupsMaintenanceRelease(f.previous,{...f.proposed,hashes:{...f.proposed.hashes,'server/src/db/database.ts':'unrelated'}}),/only the reviewed/);
  assert.throws(()=>assertGroupsMaintenanceRelease(f.previous,f.previous),/only the reviewed/);
});

test('maintenance requires every frozen migration input, its fingerprint, and the exact candidate source root',()=>{
  const f=fixture(),hashes=Object.fromEntries(groupsMigrationSourceFiles.map(name=>[name,'c'.repeat(64)]));
  const manifest={revision:f.candidate.releaseRevision,hashes};
  const rehearsal={version:1,kind:'groups_migration_rehearsal',workspaceRoot:f.candidate.workspaceRoot,sourceRoot:f.candidate.releaseRoot,originalTablesUnchanged:true,integrity:'ok',foreignKeyViolations:0,migration:{groupsReady:true},migrationSourceHashes:hashes,migrationSourceFingerprint:fingerprint(JSON.stringify(hashes))};
  assert.doesNotThrow(()=>assertGroupsRehearsal(rehearsal,f.candidate,manifest));
  const {['server/src/domain/groups.ts']:missing,...incomplete}=hashes;
  assert.throws(()=>assertGroupsRehearsal({...rehearsal,migrationSourceHashes:incomplete,migrationSourceFingerprint:fingerprint(JSON.stringify(incomplete))},f.candidate,manifest),/incomplete or changed/);
  assert.throws(()=>assertGroupsRehearsal({...rehearsal,migrationSourceHashes:{...hashes,'extra.ts':'c'.repeat(64)}},f.candidate,manifest),/incomplete or changed/);
  assert.throws(()=>assertGroupsRehearsal({...rehearsal,migrationSourceFingerprint:'d'.repeat(64)},f.candidate,manifest),/incomplete or changed/);
  assert.throws(()=>assertGroupsRehearsal({...rehearsal,sourceRoot:f.current.releaseRoot},f.candidate,manifest),/exact frozen/);
});

test('separate explicit authorization is required before any maintenance effect',async()=>{
  const f=fixture();await assert.rejects(applyGroupsMaintenance({...f.plan,authorized:false},f.ops),/Separate owner approval/);
  assert.deepEqual(f.events,[]);
});

test('maintenance verifies, backs up, migrates and promotes without any start or stop operation',async()=>{
  const f=fixture(),result=await applyGroupsMaintenance(f.plan,f.ops);
  assert.equal(result.applicationStarted,false);assert.equal(result.revision,f.candidate.releaseRevision);
  assert.deepEqual(f.events,['acquire','assertStopped','backup','migrate','migrated','promote','refreshStartup','applied','release']);
});

test('an unrelated schema change fails before checking runtime, backup or migration',async()=>{
  const f=fixture();f.proposed.hashes['server/src/db/database.ts']='unrelated';
  await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/only the reviewed/);
  assert.deepEqual(f.events,['acquire','release','failed_before_migration']);
});

test('a running owner or failed backup releases exclusion and never migrates or promotes',async()=>{
  for (const phase of ['assertStopped','backup'] as const) {
    const f=fixture();f.ops[phase]=async()=>{throw new Error(phase+' failed');};
    await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/failed/);
    assert.ok(!f.events.includes('migrate'));assert.ok(!f.events.includes('promote'));
    assert.ok(f.events.includes('release'));assert.equal(f.records.at(-1)?.maintenanceRetained,false);
  }
});

test('a configuration change while backing up blocks before the owner migration begins',async()=>{
  const f=fixture();f.ops.backup=async()=>{f.changeConfiguration();return {};};
  await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/configuration changed/);
  assert.ok(!f.events.includes('migrate'));assert.ok(f.events.includes('release'));
});

test('a migration failure retains maintenance markers for explicit recovery and never promotes',async()=>{
  const f=fixture();f.ops.migrate=()=>{f.events.push('migrate');throw new Error('atomic migration failed');};
  await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/atomic migration failed/);
  assert.ok(!f.events.includes('release'));assert.ok(!f.events.includes('promote'));
  assert.equal(f.records.at(-1)?.status,'owner_recovery_required');assert.equal(f.records.at(-1)?.maintenanceRetained,true);
});

test('promotion or Startup failure after migration retains maintenance and never rolls back or restarts',async()=>{
  for (const phase of ['promote','refreshStartup'] as const) {
    const f=fixture();f.ops[phase]=()=>{throw new Error(phase+' failed');};
    await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/failed/);
    assert.ok(f.events.includes('migrated'));assert.ok(!f.events.includes('release'));assert.ok(!f.events.includes('applied'));
    assert.equal(f.records.at(-1)?.applicationStarted,false);
  }
});

test('marker cleanup failure after apply replaces the applied status with an explicit recovery record',async()=>{
  const f=fixture();f.ops.acquire=()=>()=>{throw new Error('cleanup failed');};
  await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/cleanup failed/);
  assert.equal(f.records.at(-1)?.status,'owner_recovery_required');assert.equal(f.records.at(-1)?.maintenanceRetained,true);
});

test('acquisition cleanup failure reports retained maintenance before any database effect',async()=>{
  const f=fixture();f.ops.acquire=()=>{throw new OwnerMaintenanceError([new Error('cleanup failed')],()=>{});};
  await assert.rejects(applyGroupsMaintenance(f.plan,f.ops),/Maintenance acquisition failed/);
  assert.ok(!f.events.includes('backup'));assert.ok(!f.events.includes('migrate'));
  assert.equal(f.records.at(-1)?.status,'owner_recovery_required');assert.equal(f.records.at(-1)?.maintenanceRetained,true);
});
