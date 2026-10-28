import {assertGroupsMaintenanceRelease} from './groups-maintenance.js';
import {assertCandidateOwnerConfiguration, assertConfigurationFingerprint, OwnerMaintenanceError, type OwnerReleaseManifest} from './owner-release-core.js';
import type {OwnerConfiguration} from './owner-runtime-core.js';
import {fingerprint} from './owner-runtime-core.js';
import {groupsMigrationSourceFiles} from '../prepare-groups-migration.js';

export function assertGroupsRehearsal(rehearsal: {
  version?: number; kind?: string; workspaceRoot?: string; sourceRoot?: string;
  originalTablesUnchanged?: boolean; integrity?: string; foreignKeyViolations?: number;
  migration?: {groupsReady?: boolean}; migrationSourceHashes?: Record<string,string>; migrationSourceFingerprint?: string;
}, candidate: OwnerConfiguration, manifest: OwnerReleaseManifest) {
  if (rehearsal.version!==1 || rehearsal.kind!=='groups_migration_rehearsal' || rehearsal.workspaceRoot!==candidate.workspaceRoot ||
      rehearsal.sourceRoot!==candidate.releaseRoot || rehearsal.originalTablesUnchanged!==true || rehearsal.integrity!=='ok' ||
      rehearsal.foreignKeyViolations!==0 || rehearsal.migration?.groupsReady!==true) throw new Error('A successful rehearsal from the exact frozen candidate is required');
  const hashes=rehearsal.migrationSourceHashes;
  if (!hashes || Object.keys(hashes).length!==groupsMigrationSourceFiles.length ||
      groupsMigrationSourceFiles.some(name=>!Object.hasOwn(hashes,name) || !/^[a-f0-9]{64}$/.test(hashes[name]) || manifest.hashes[name]!==hashes[name]) ||
      rehearsal.migrationSourceFingerprint!==fingerprint(JSON.stringify(hashes))) throw new Error('Rehearsal migration code hashes are incomplete or changed');
}

export interface GroupsMaintenancePlan {
  authorized: boolean;
  current: OwnerConfiguration;
  candidate: OwnerConfiguration;
  expectedConfigurationFingerprint: string;
}
export interface GroupsMaintenanceOperations {
  acquire(): () => void;
  readConfiguration(): OwnerConfiguration;
  verify(configuration: OwnerConfiguration): OwnerReleaseManifest;
  assertStopped(): Promise<void>;
  backup(): Promise<unknown>;
  migrate(): unknown;
  promote(configuration: OwnerConfiguration, expectedFingerprint: string): void;
  refreshStartup(configuration: OwnerConfiguration): void;
  record(event: Record<string, unknown>): void;
}

/** Explicit schema maintenance, separate from ordinary release activation.
 * Never stops, starts, rebuilds, restores a DB, or replays publishing work.
 * A failure after migration begins retains the exclusion for owner recovery.
 */
export async function applyGroupsMaintenance(plan: GroupsMaintenancePlan, ops: GroupsMaintenanceOperations) {
  if (plan.authorized !== true) throw new Error('Separate owner approval and --apply are required for Groups maintenance');
  assertConfigurationFingerprint(plan.current, plan.expectedConfigurationFingerprint);
  assertCandidateOwnerConfiguration(plan.current, plan.candidate);
  let release: (() => void) | undefined;
  let migrationAttempted = false;
  try {
    release = ops.acquire();
    assertConfigurationFingerprint(ops.readConfiguration(), plan.expectedConfigurationFingerprint);
    assertGroupsMaintenanceRelease(ops.verify(plan.current), ops.verify(plan.candidate));
    await ops.assertStopped();
    const backup = await ops.backup();
    // Recheck after the asynchronous backup, before any owner DB write.
    assertConfigurationFingerprint(ops.readConfiguration(), plan.expectedConfigurationFingerprint);
    migrationAttempted = true;
    const migration = ops.migrate();
    ops.record({status: 'migrated', backup, migration, applicationStarted: false});
    ops.promote(plan.candidate, plan.expectedConfigurationFingerprint);
    ops.refreshStartup(plan.candidate);
    ops.record({status: 'applied', revision: plan.candidate.releaseRevision, applicationStarted: false});
    // Keep cleanup inside the error handler: a failed lease release must not
    // leave an "applied" receipt that hides retained startup exclusion.
    release(); release = undefined;
    return {revision: plan.candidate.releaseRevision, applicationStarted: false, backup, migration};
  } catch (error) {
    const errors: unknown[]=[error];
    let retained=migrationAttempted || error instanceof OwnerMaintenanceError;
    if (!migrationAttempted && release) {
      try {release();release=undefined;}catch(cleanupError){retained=true;errors.push(cleanupError);}
    }
    try {ops.record({status: retained ? 'owner_recovery_required' : 'failed_before_migration',
      maintenanceRetained: retained, applicationStarted: false});}catch(recordError){errors.push(recordError);}
    if (errors.length>1) throw new AggregateError(errors,'Groups maintenance failed; inspect private recovery artifacts');
    throw error;
  }
}
