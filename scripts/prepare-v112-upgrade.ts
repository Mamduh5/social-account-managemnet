import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { assertOwnerQueueSafe } from '../server/src/domain/runtime-recovery.js';
import { calendarSchemaReady } from '../server/src/db/calendar-schema.js';
import { generalPostsReady } from '../server/src/db/general-posts-schema.js';
import { fingerprint, readJson, writeJson, privateDirectory, type OwnerConfiguration } from './lib/owner-runtime-core.js';

const root = path.resolve(__dirname, '..');

async function main() {
  const configFile = path.join(root, '.data', 'runtime', 'owner-config.json');
  const config = readJson(configFile) as OwnerConfiguration;
  const dbPath = path.join(config.dataDir, 'social_command_center.db');
  const source = new Database(dbPath, { readonly: true, fileMustExist: true });

  const outDir = path.join(root, '.data', 'v112-owner');
  privateDirectory(outDir);

  try {
    // 1. Inspect queue & submissions
    const queue = source.prepare(`
      SELECT pd.id, pd.status, p.scheduled_at, pd.remote_post_id, pd.submission_state 
      FROM publishing_destinations pd 
      JOIN publishing_posts p ON p.id=pd.post_id 
      WHERE pd.status IN ('preparing','branding','uploading','scheduled') 
      ORDER BY pd.id
    `).all() as any[];

    const protectedRows = source.prepare(`
      SELECT * FROM publishing_destinations WHERE status='awaiting_confirmation' ORDER BY id
    `).all() as any[];

    assertOwnerQueueSafe(queue, protectedRows.map(r => r.id));

    if (queue.some(r => r.submission_state)) {
      throw new Error('Pending submission intent requires reconciliation before upgrade');
    }

    const uncertain = source.prepare(`
      SELECT id, status, submission_state 
      FROM publishing_destinations 
      WHERE status='failed' AND (remote_post_id IS NOT NULL OR submission_state IS NOT NULL) 
      ORDER BY id
    `).all() as any[];

    if (uncertain.length) {
      throw new Error('Failed destinations with remote_post_id or submission intent require reconciliation before upgrade');
    }

    // 2. Inspect sync
    const sync = source.prepare(`SELECT * FROM sync_states WHERE status='syncing'`).all();
    if (sync.length) {
      throw new Error('Sync is currently active; wait for idle boundary before upgrade');
    }

    // 3. Verify protected holds
    const holds = ['dest-mvf5hdwf-19hi', 'dest-mvf5j24q-ub0y', 'dest-mvf5j24r-rw4x'];
    const foundHolds = protectedRows.filter(r => holds.includes(r.id));
    if (foundHolds.length !== 3) {
      throw new Error('Protected holds missing or changed');
    }

    // 4. Verify existing drafts and Page B campaign
    const testDraft = source.prepare(`SELECT * FROM publishing_drafts WHERE id='draft-0b2ae8dd-a4e6-4d57-9509-b2cdd142c58f'`).get() as any;
    if (!testDraft || testDraft.status !== 'draft' || testDraft.approved_revision !== null) {
      throw new Error('Page A test draft missing or in unexpected state');
    }

    const pageBCampaign = source.prepare(`SELECT * FROM publishing_campaigns WHERE id='camp-v112-codex-page-b-concepts-20261027'`).get() as any;
    if (!pageBCampaign || pageBCampaign.status !== 'draft') {
      throw new Error('Page B creative campaign missing or in unexpected state');
    }

    const pageBDrafts = source.prepare(`SELECT count(*) as count FROM publishing_drafts WHERE campaign_id='camp-v112-codex-page-b-concepts-20261027'`).get() as { count: number };
    if (pageBDrafts.count !== 7) {
      throw new Error(`Page B creative concepts draft count mismatch: expected 7, found ${pageBDrafts.count}`);
    }

    // 5. Verify schema readiness
    if (!generalPostsReady(source)) throw new Error('generalPostsReady check failed');
    if (!calendarSchemaReady(source)) throw new Error('calendarSchemaReady check failed');

    // 6. Create WAL-safe online backup
    const backupFile = path.join(outDir, 'owner-pre-v112.db');
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    await source.backup(backupFile);

    // 7. Verify integrity and FKs on the backup
    const backupDb = new Database(backupFile, { readonly: true, fileMustExist: true });
    let integrityCheck: string;
    let fkViolations: unknown[];
    try {
      integrityCheck = backupDb.pragma('integrity_check', { simple: true }) as string;
      fkViolations = backupDb.pragma('foreign_key_check') as unknown[];
    } finally {
      backupDb.close();
    }

    if (integrityCheck !== 'ok') {
      throw new Error(`Backup integrity check failed: ${integrityCheck}`);
    }
    if (fkViolations.length > 0) {
      throw new Error(`Backup foreign key violations detected: ${fkViolations.length}`);
    }

    const backupSha256 = fingerprint(fs.readFileSync(backupFile));
    const backupStat = fs.statSync(backupFile);

    const report = {
      timestamp: new Date().toISOString(),
      queueSafe: true,
      activeJobs: queue.length,
      uncertainFailed: uncertain.length,
      activeSyncing: sync.length,
      protectedHolds: foundHolds.map(h => ({ id: h.id, status: h.status })),
      pageATestDraft: { id: testDraft.id, status: testDraft.status, approved_revision: testDraft.approved_revision },
      pageBCampaign: { id: pageBCampaign.id, status: pageBCampaign.status, draftCount: pageBDrafts.count },
      schemaReady: { generalPosts: true, calendar: true },
      backup: {
        file: backupFile,
        size: backupStat.size,
        sha256: backupSha256,
        integrity: integrityCheck,
        fkViolations: fkViolations.length
      }
    };

    writeJson(path.join(outDir, 'pre-upgrade-backup-report.json'), report);
    console.log(JSON.stringify(report, null, 2));

  } finally {
    source.close();
  }
}

main().catch(err => {
  console.error('Pre-upgrade preparation failed:', err);
  process.exitCode = 1;
});
