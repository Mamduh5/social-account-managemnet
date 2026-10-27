import {
  assertCandidateOwnerConfiguration, assertConfigurationFingerprint, assertNoSchemaChange,
  configurationFingerprint, type OwnerReleaseManifest,
} from './owner-release-core.js';
import type { OwnerConfiguration } from './owner-runtime-core.js';

export interface OwnerReleaseActivationPlan {
  authorized: boolean;
  current: OwnerConfiguration;
  candidate: OwnerConfiguration;
  expectedConfigurationFingerprint: string;
}

export interface OwnerReleaseActivationOperations {
  /** Acquire this operation's update/maintenance exclusion; release only its owned lease, idempotently. */
  acquire(): () => void;
  readConfiguration(): OwnerConfiguration;
  verify(configuration: OwnerConfiguration): OwnerReleaseManifest;
  wasRunning(): boolean;
  stop(configuration: OwnerConfiguration): Promise<void>;
  backup(): Promise<unknown>;
  /** Atomically replace the pointer after revalidating under the controller lock. */
  promote(configuration: OwnerConfiguration, expectedFingerprint: string): void;
  /** Update an enabled owner startup entry without enabling a disabled entry. */
  refreshStartup(configuration: OwnerConfiguration): void;
  start(configuration: OwnerConfiguration): Promise<void>;
  record(event: Record<string, unknown>): void;
}

export interface OwnerReleaseActivationResult {
  revision: string;
  restarted: boolean;
  backup: unknown;
}

/** Orchestrate an explicitly authorized activation; all effects belong to ops. */
export async function activateOwnerRelease(
  plan: OwnerReleaseActivationPlan,
  ops: OwnerReleaseActivationOperations,
): Promise<OwnerReleaseActivationResult> {
  if (plan.authorized !== true) throw new Error('Explicit owner authorization is required to activate a release');
  const current = { ...plan.current }, candidate = { ...plan.candidate };
  const expectedFingerprint = plan.expectedConfigurationFingerprint;
  assertConfigurationFingerprint(current, expectedFingerprint);
  assertCandidateOwnerConfiguration(current, candidate);
  const candidateFingerprint = configurationFingerprint(candidate);

  let release: (() => void) | undefined;
  let released = false, running = false, stopped = false, promoted = false, promotionAttempted = false;
  let restartOriginal = false, phase = 'acquire';
  let backup: unknown;
  const errors: unknown[] = [];
  const identity = { previousRevision: current.releaseRevision, candidateRevision: candidate.releaseRevision };
  const recordFailure = (event: Record<string, unknown>) => {
    try { ops.record({ ...identity, ...event }); } catch (error) { errors.push(error); }
  };
  const fail = () => {
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, 'Owner release activation failed; inspect the recorded recovery instructions');
  };

  try {
    release = ops.acquire();
    phase = 'preflight';
    const live = ops.readConfiguration();
    assertConfigurationFingerprint(live, expectedFingerprint);
    assertCandidateOwnerConfiguration(live, candidate);
    const previousManifest = ops.verify(current), candidateManifest = ops.verify(candidate);
    if (previousManifest.revision !== current.releaseRevision || candidateManifest.revision !== candidate.releaseRevision) {
      throw new Error('Verified manifest does not match its configured release revision');
    }
    assertNoSchemaChange(previousManifest, candidateManifest);
    running = ops.wasRunning();
    ops.record({ event: 'owner_release_activation_verified', ...identity, wasRunning: running });

    phase = 'stop';
    await ops.stop(current);
    stopped = true;
    phase = 'backup';
    backup = await ops.backup();
    phase = 'configuration_recheck';
    assertConfigurationFingerprint(ops.readConfiguration(), expectedFingerprint);
    phase = 'promote';
    // The injected operation revalidates and atomically replaces the pointer
    // under the controller lock; this module never writes configuration or data.
    promotionAttempted = true;
    ops.promote(candidate, expectedFingerprint);
    promoted = true;
    phase = 'refresh_startup';
    ops.refreshStartup(candidate);
    ops.record({ event: 'owner_release_activation_promoted', ...identity });
  } catch (error) {
    errors.push(error);
    if (stopped) {
      // A rename can succeed before promote throws. Read the actual pointer
      // rather than assuming an exception means the old release is still active.
      try {
        const activeFingerprint = configurationFingerprint(ops.readConfiguration());
        promoted ||= promotionAttempted && activeFingerprint === candidateFingerprint;
        restartOriginal = !promoted && running && activeFingerprint === expectedFingerprint;
      } catch (readError) { errors.push(readError); }
    }
    recordFailure({
      event: promoted ? 'owner_release_activation_rollback_required' : 'owner_release_activation_failed',
      phase, originalRestartPlanned: restartOriginal,
      recovery: promoted
        ? 'Candidate configuration retained. Inspect runtime state, then use a separately verified and authorized rollback to the previous revision; do not restore the database.'
        : restartOriginal
          ? 'The original configuration is unchanged; restart it only after releasing this activation exclusion.'
          : 'Inspect configuration and runtime state before further lifecycle actions; no automatic restart is authorized by this failed activation.',
    });
  } finally {
    if (release) {
      try { release(); released = true; } catch (error) {
        errors.push(error);
        recordFailure({ event: 'owner_release_activation_exclusion_release_failed', phase: 'release',
          recovery: 'Inspect the owned maintenance and update exclusion before starting any runtime.' });
        if (promoted) recordFailure({ event: 'owner_release_activation_rollback_required', phase: 'release',
          recovery: 'Candidate configuration retained. Resolve the owned exclusion, then use a separately verified and authorized rollback to the previous revision; do not restore the database.' });
      }
    }
  }

  if (errors.length) {
    if (restartOriginal && released) {
      try {
        await ops.start(current);
        ops.record({ event: 'owner_release_original_restarted_after_failure', ...identity });
      } catch (error) {
        errors.push(error);
        recordFailure({ event: 'owner_release_original_restart_failed', phase: 'restart_original',
          recovery: 'The original configuration was retained. Inspect its startup failure without restoring the database or force-killing processes.' });
      }
    }
    return fail();
  }

  try {
    if (running) await ops.start(candidate);
    ops.record({ event: 'owner_release_activation_completed', ...identity, restarted: running });
    return { revision: candidate.releaseRevision, restarted: running, backup };
  } catch (error) {
    errors.push(error);
    recordFailure({ event: 'owner_release_activation_rollback_required', phase: 'start_candidate',
      recovery: 'Candidate configuration retained. Inspect startup state, then use a separately verified and authorized rollback to the previous revision; do not restore the database.' });
    return fail();
  }
}
