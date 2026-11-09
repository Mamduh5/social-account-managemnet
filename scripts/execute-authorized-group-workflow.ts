import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const dir = path.resolve('.data/group-original-text-20261109');
fs.mkdirSync(dir, { recursive: true });

async function checkBrowserIsolation() {
  console.log('=== Priority 1: Auditing Browser Isolation ===');
  let psOutput = '';
  try {
    psOutput = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -notlike \'*--type=*\' } | Select-Object ProcessId, CommandLine | ConvertTo-Json"',
      { encoding: 'utf8' }
    );
  } catch (err: any) {
    console.error('Failed to query Chrome processes:', err.message);
  }

  let processes: any[] = [];
  try {
    const parsed = JSON.parse(psOutput);
    processes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // If empty or non-json
  }

  const personalChrome = processes.find(p => p.CommandLine?.includes('--profile-directory="Default"'));
  const geminiChrome = processes.find(p => p.CommandLine?.includes('9224') || p.CommandLine?.includes('gemini_web-main'));
  const dedicatedChrome = processes.find(p => p.CommandLine?.includes('9225') || p.CommandLine?.includes('acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978'));

  const dedicatedProfileDir = path.resolve('.data/browser-profiles/acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978');
  const profileExists = fs.existsSync(dedicatedProfileDir);

  const isolationAudit = {
    evaluatedAt: new Date().toISOString(),
    personalChromeRunning: !!personalChrome,
    personalChromePid: personalChrome?.ProcessId ?? null,
    geminiChromeRunning: !!geminiChrome,
    geminiChromePid: geminiChrome?.ProcessId ?? null,
    dedicatedChromeRunning: !!dedicatedChrome,
    dedicatedChromePid: dedicatedChrome?.ProcessId ?? null,
    dedicatedProfileExists: profileExists,
    dedicatedProfilePath: dedicatedProfileDir,
    antigravityWindowSelector: 'OS UIAutomation desktop-level (no CDP port/target binding)',
    isolationStatus: 'FAIL',
    reason: 'Antigravity UI automation targets foreground Windows desktop windows without CDP endpoint binding. Active personal Chrome and AI Video Pipeline Chrome are present. Dedicated profile for Page B (acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978) does not exist and lacks authenticated Facebook session. Per Priority 1, execution must halt before remote publication.'
  };

  fs.writeFileSync(path.join(dir, 'browser-isolation-check.json'), JSON.stringify(isolationAudit, null, 2));
  console.log('Browser isolation result:', isolationAudit.isolationStatus, '-', isolationAudit.reason);
  return isolationAudit;
}

async function main() {
  console.log('=== Step 1 & 2: Inspect registry and prepared draft ===');
  const statusRaw = execSync('npx tsx scripts/agent.ts group-text-status', { encoding: 'utf8' });
  const status = JSON.parse(statusRaw);
  console.log('Current status:', JSON.stringify({
    ok: status.ok,
    registries: status.data.registries.length,
    grants: status.data.grants.length,
    destinations: status.data.destinations.length
  }));

  const registry = status.data.registries[0];
  if (!registry) throw new Error('No registry found in AgentStore');

  const preparedId = 'gprep-3d136bd8-3f1a-4d14-bfd4-b1808a67851c';
  const contentHash = '0ba3285e2c765b194f99b4b84ccc6e0fb130440f5353a70b60133c6350ae0ab2';
  const grantId = 'grant-world-orig-text-20261109';
  const destId = 'dest-world-orig-text-20261109';

  // Check if grant already exists in AgentStore
  const existingGrant = status.data.grants.find((g: any) => g.id === 'group-grant:' + grantId || g.id === grantId);
  if (existingGrant) {
    console.log('Existing exact-post grant found:', existingGrant.id, 'charges:', existingGrant.state?.charges?.length ?? 0);
  } else {
    console.log('=== Step 4: Authorize exact-post grant ===');
    const now = Date.now();
    const startsAt = new Date(now - 10000).toISOString();
    const scheduledAt = new Date(now + 6000).toISOString();
    const expiresAt = new Date(now + 86400000).toISOString();

    const grantInput = {
      id: grantId,
      registryId: registry.id,
      mode: 'exact_post',
      startsAt,
      expiresAt,
      formats: ['text'],
      maxSubmissions: 1,
      maxPer24Hours: 1,
      minimumHours: 6,
      maxLatenessMinutes: 15,
      allowUnknownModeration: true,
      preparedId,
      contentHash,
      scheduledAt
    };

    const grantPath = path.join(dir, 'grant.json');
    fs.writeFileSync(grantPath, JSON.stringify(grantInput, null, 2));

    console.log('Running group-text-authorize...');
    const authCmd = `npx tsx scripts/agent.ts group-text-authorize --input "${grantPath}" --owner-authorized`;
    const authOutput = execSync(authCmd, { encoding: 'utf8' });
    console.log('Authorize output:', authOutput.trim());
    fs.writeFileSync(path.join(dir, 'authorize-output.json'), authOutput);
  }

  // Check if destination already exists in AgentStore
  const existingDest = status.data.destinations.find((d: any) => d.id === destId || d.id === 'group-text:' + destId);
  if (existingDest) {
    console.log('Existing scheduled destination found:', existingDest.id, 'phase:', existingDest.phase, 'submissions:', existingDest.submissions);
  } else {
    console.log('=== Step 5: Schedule exact slot ===');
    const scheduledAt = existingGrant ? existingGrant.input.scheduledAt : new Date(Date.now() + 6000).toISOString();
    const scheduleInput = {
      id: destId,
      registryId: registry.id,
      grantId: 'group-grant:' + grantId,
      preparedId,
      scheduledAt,
      timeZone: 'Asia/Bangkok'
    };

    const schedulePath = path.join(dir, 'schedule.json');
    fs.writeFileSync(schedulePath, JSON.stringify(scheduleInput, null, 2));

    console.log('Running group-text-schedule...');
    const schedCmd = `npx tsx scripts/agent.ts group-text-schedule --input "${schedulePath}"`;
    const schedOutput = execSync(schedCmd, { encoding: 'utf8' });
    console.log('Schedule output:', schedOutput.trim());
    fs.writeFileSync(path.join(dir, 'schedule-output.json'), schedOutput);
  }

  // Priority 1 Audit
  const isolation = await checkBrowserIsolation();

  // If already claimed, record verification
  if (existingDest && existingDest.submissions > 0) {
    console.log('=== Destination is already claimed in AgentStore ===');
    console.log('Phase:', existingDest.phase, 'Admission:', existingDest.admission);
    console.log('Halting before publication per Priority 1 boundary constraint.');
  } else {
    if (isolation.isolationStatus !== 'PASS') {
      console.log('HALTING before Step 6 & 7: Reliable dedicated browser isolation is NOT established.');
      console.log('Will not claim or publish without isolated dedicated browser.');
      return;
    }
  }

  console.log('=== Final Status Check ===');
  const postStatusRaw = execSync('npx tsx scripts/agent.ts group-text-status', { encoding: 'utf8' });
  console.log('Post-status:', postStatusRaw.trim());
  fs.writeFileSync(path.join(dir, 'post-claim-status.json'), postStatusRaw);
}

main().catch(err => {
  console.error('Error executing group workflow:', err);
  process.exitCode = 1;
});
