import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
// Every suite receives its own disposable database/media directory. Never run regression tests on user data.
const base = path.resolve('.data', 'test-runs');
mkdirSync(base, { recursive: true });
let failed = false;
for (const file of readdirSync('test').filter((f) => f.endsWith('.test.ts'))) {
  const dataDir = mkdtempSync(
    path.join(base, file.replace('.test.ts', '') + '-')
  );
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', path.join('test', file)],
    { stdio: 'inherit', env: { ...process.env, SCC_DATA_DIR: dataDir } }
  );
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
