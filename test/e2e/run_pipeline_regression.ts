import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = fs.mkdtempSync(path.resolve('.data', 'pipeline-regression-'));
const base = 'http://127.0.0.1:3193';
let log = '';
const backend = spawn(
  process.execPath,
  ['--import', 'tsx', 'server/src/index.ts'],
  {
    env: { ...process.env, PORT: '3193', SCC_DATA_DIR: dir },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
backend.stdout!.on('data', (b) => (log += b.toString()));
backend.stderr!.on('data', (b) => (log += b.toString()));
async function main() {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('Isolated backend did not start');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'test/e2e/real_pipeline_acceptance.ts'],
    {
      env: {
        ...process.env,
        SCC_BASE_URL: base,
        SCC_SCREENSHOT_DIR: path.join(dir, 'screenshots'),
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout!.on('data', (b) => {
    output += b.toString();
    process.stdout.write(b);
  });
  child.stderr!.on('data', (b) => {
    output += b.toString();
    process.stderr.write(b);
  });
  const code = await new Promise<number | null>((resolve) =>
    child.once('exit', resolve)
  );
  fs.writeFileSync(path.join(dir, 'acceptance.log'), output);
  process.exitCode = code || 0;
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const done = new Promise((r) => backend.once('exit', r));
    backend.kill();
    await done;
    fs.writeFileSync(path.join(dir, 'server.log'), log);
    console.log('Isolated pipeline regression artifacts: ' + dir);
  });
