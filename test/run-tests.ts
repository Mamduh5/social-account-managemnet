import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// Every suite receives its own disposable database/media directory. Never run regression tests on user data.
const base = path.join(os.tmpdir(), 'scc-test-runs');
mkdirSync(base, { recursive: true });
let failed = false;
const results: {file:string;passed:boolean}[] = [];
for (const file of readdirSync('test').filter((f) => f.endsWith('.test.ts'))) {
  const dataDir = mkdtempSync(
    path.join(base, file.replace('.test.ts', '') + '-')
  );
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', path.join('test', file)],
    { stdio: 'inherit', env: { ...process.env, SCC_DATA_DIR: dataDir, SCC_ISOLATED_TEST: 'true', SCC_PAUSE_WORKERS: 'true' } }
  );
  results.push({file,passed:result.status===0});
  if (result.status !== 0) failed = true;
}
console.log('SCC_SUITE_SUMMARY '+JSON.stringify({suites:results.length,passedSuites:results.filter(result=>result.passed).length,failedSuites:results.filter(result=>!result.passed).map(result=>result.file)}));
process.exitCode = failed ? 1 : 0;
