import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const baseUrl = 'http://127.0.0.1:3001';
  const outDir = path.resolve('.data/v112-owner/group-inspection');

  const createdGroupData = JSON.parse(fs.readFileSync(path.join(outDir, 'created-group.json'), 'utf8'));
  const groupUrl = createdGroupData.url; // e.g. https://www.facebook.com/groups/1830083181521795

  console.log('1. Registering Group in Social Command Center...');
  const groupRes = await fetch(`${baseUrl}/api/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'แก้บัคยาวๆๆ — กลุ่มทดสอบระบบ',
      url: `${groupUrl}/`,
      identityType: 'page',
      accountId: 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5',
      membership: 'admin',
      category: 'Software Testing',
      notes: 'Private hidden test group created natively for V1.12 real acceptance testing',
      rules: '1. Software testing only\n2. Administered by แก้บัคยาวๆๆ\n3. No external members',
      rulesReviewedAt: '2026-10-27'
    })
  });

  const groupJson = await groupRes.json();
  console.log('Registered Group Response:', groupJson);
  if (!groupJson.success) throw new Error(JSON.stringify(groupJson));
  const groupId = groupJson.group.id;

  console.log('2. Preparing Group Handoff Post...');
  const prepRes = await fetch(`${baseUrl}/api/groups/${groupId}/prepared`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'post',
      content: 'ทดสอบระบบ Group Manual Handoff — Social Command Center V1.12\n\nโพสต์นี้สร้างขึ้นเพื่อทดสอบขั้นตอนการส่งต่องาน (Manual Handoff) ในกลุ่มส่วนตัวที่เพจ แก้บัคยาวๆๆ เป็นผู้ดูแล',
      relevance: 'การทดสอบฟังก์ชัน Handoff ของกลุ่มที่เชื่อมโยงกับเพจแก้บัคยาวๆๆ',
      sourcePageId: 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5',
      media: []
    })
  });

  const prepJson = await prepRes.json();
  console.log('Prepared Response:', prepJson);
  if (!prepJson.success) throw new Error(JSON.stringify(prepJson));
  const preparedId = prepJson.prepared.id;

  console.log('3. Fetching Handoff Package...');
  const pkgRes = await fetch(`${baseUrl}/api/groups/prepared/${preparedId}/package`);
  const pkgJson = await pkgRes.json();
  console.log('Package Response:', pkgJson);

  fs.writeFileSync(path.join(outDir, 'handoff-package.json'), JSON.stringify({
    group: groupJson.group,
    prepared: prepJson.prepared,
    package: pkgJson
  }, null, 2));

  console.log('Group registration and handoff package preparation complete!');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
