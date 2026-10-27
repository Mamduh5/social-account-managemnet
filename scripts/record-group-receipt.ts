async function main() {
  const baseUrl = 'http://127.0.0.1:3001';
  const preparedId = 'gprep-27d6b1bb-6cc4-46a6-bf96-5315f600b7d3';
  const postUrl = 'https://www.facebook.com/groups/1830083181521795/posts/1830085728188207/';

  console.log(`Submitting manual receipt for ${preparedId}...`);
  const res = await fetch(`${baseUrl}/api/groups/prepared/${preparedId}/receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirmOwnerEntered: true,
      url: postUrl,
      note: 'Manual publication and test comment verified in private test group แก้บัคยาวๆๆ — กลุ่มทดสอบระบบ'
    })
  });

  const json = await res.json();
  console.log('Receipt Response:', json);

  // Also fetch the package again to see the updated status
  const pkgRes = await fetch(`${baseUrl}/api/groups/prepared/${preparedId}/package`);
  const pkgJson = await pkgRes.json();
  console.log('Updated Package Status:', pkgJson.publicationStatus);
  console.log('Updated Text Header:', pkgJson.text.slice(0, 100));
}

main().catch(console.error);
