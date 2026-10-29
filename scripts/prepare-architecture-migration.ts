import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrateArchitectureDatabase } from '../server/src/db/architecture-schema.js';
import { privateDirectory } from './lib/owner-runtime-core.js';

/** Copy-only rehearsal. There is intentionally no live apply, replace, or activation option. */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !['--database', '--copy-to'].every(flag => args.includes(flag))) throw new Error('Use --database SOURCE --copy-to NEW_COPY. Live apply is unavailable.');
  const option = (flag: string) => args[args.indexOf(flag) + 1];
  const sourcePath = fs.realpathSync(path.resolve(option('--database')));
  const target = path.resolve(option('--copy-to'));
  const isolatedRoot = process.env.SCC_ISOLATED_TEST === 'true' && process.env.SCC_DATA_DIR && /test-runs/i.test(process.env.SCC_DATA_DIR) ? path.resolve(process.env.SCC_DATA_DIR) : undefined;
  const reviewRoot = isolatedRoot ? path.join(isolatedRoot,'architecture-review') : path.resolve(__dirname, '..', '.data', 'architecture-review');
  const relative = path.relative(reviewRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || target.toLowerCase() === sourcePath.toLowerCase() || fs.existsSync(target)) throw new Error('The copy must be a new file under .data/architecture-review. Existing files and the source cannot be replaced.');
  privateDirectory(path.dirname(target));
  const actualTarget = path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  const actualRelative = path.relative(fs.realpathSync(reviewRoot), actualTarget);
  if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative)) throw new Error('The copy resolves outside the review directory.');
  fs.closeSync(fs.openSync(target, 'wx'));
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(target);
    const copy = new Database(target, { fileMustExist: true });
    try {
      copy.pragma('foreign_keys = ON');
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Review copy integrity check failed.');
      const result = migrateArchitectureDatabase(copy);
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Migrated copy integrity check failed.');
      console.log(JSON.stringify({ ...result, copy: target, sourceOpenedReadOnly: true, sourceReplaced: false, liveApplyPerformed: false }));
    } finally { copy.close(); }
  } finally { source.close(); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
