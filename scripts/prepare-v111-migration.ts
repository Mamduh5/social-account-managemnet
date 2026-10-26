import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { calendarSchemaReady } from '../server/src/db/calendar-schema.js';
import { migrateV111Database } from '../server/src/db/v111-migration.js';
import { generalPostsReady } from '../server/src/db/general-posts-schema.js';
import { privateDirectory } from './lib/owner-runtime-core.js';

async function main() {
  // This command deliberately has no in-place/live apply or replacement mode.
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!['--database', '--copy-to', '--report'].includes(args[i]) || !args[i + 1]) throw new Error('Only --database PATH [--copy-to NEW_PATH] [--report NEW_JSON] are supported; live apply is unavailable');
  }
  const option = (name: string) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  const sourceName = option('--database');
  if (!sourceName) throw new Error('Provide --database PATH; source is opened read-only');
  const sourcePath = fs.realpathSync(path.resolve(sourceName));
  const outputName = option('--copy-to');
  const reportName = option('--report');
  const allowedRoot = path.resolve(__dirname, '..', '.data', 'v111-integration');
  const inside = (candidate: string) => {
    const relative = path.relative(allowedRoot, candidate);
    return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
  };
  const reserve = (name: string) => {
    const absolute = path.resolve(name);
    if (!inside(absolute) || absolute.toLowerCase() === sourcePath.toLowerCase() || fs.existsSync(absolute)) throw new Error('Output must be a new file inside .data/v111-integration; existing files and the source are never replaced');
    let ancestor = path.dirname(absolute);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const realCandidate = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute));
    if (!inside(realCandidate)) throw new Error('Output resolves outside the isolated preparation directory');
    privateDirectory(path.dirname(absolute));
    const realParent = fs.realpathSync(path.dirname(absolute));
    if (!inside(path.join(realParent, path.basename(absolute)))) throw new Error('Output resolves outside the isolated preparation directory');
    const descriptor = fs.openSync(absolute, 'wx'); fs.closeSync(descriptor);
    return absolute;
  };
  // Resolve every output before opening the original and reject overlapping names.
  const target = outputName ? reserve(outputName) : undefined;
  const reportFile = reportName ? reserve(reportName) : undefined;
  if (reportFile && !target) throw new Error('--report requires --copy-to');
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const report: Record<string, unknown> = { sourcePath, sourceReadOnly: true, sourceReplaced: false, liveApplyPerformed: false, generalPostsReady: generalPostsReady(source), calendarReady: calendarSchemaReady(source) };
  try {
    if (target) {
      if (!generalPostsReady(source)) throw new Error('V1.10 general-post migration is required before preparing V1.11');
      await source.backup(target);
      const copy = new Database(target, { fileMustExist: true });
      try {
        copy.pragma('foreign_keys=ON');
        Object.assign(report, { copyPath: target, copyPrepared: true, migration: migrateV111Database(copy) });
      } finally { copy.close(); }
      // The closed backup is a self-contained SQLite file, never copied over live data.
      report.copySha256 = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    }
    if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { source.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
