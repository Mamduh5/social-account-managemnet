async function run() {
  try {
    const postsRes = await fetch('http://127.0.0.1:3001/api/publishing/posts');
    const posts = await postsRes.json();
    console.log('Total posts:', posts.posts?.length);
    const pageAPosts = posts.posts?.filter((p: any) => p.destinations?.some((d: any) => (d.account_id || d.accountId) === 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5'));
    console.log('Page A posts count:', pageAPosts?.length);
    for (const p of (pageAPosts || [])) {
      console.log(`- Post: ${p.id} | ${p.title} | status: ${p.status} | type: ${p.content_type || p.contentType}`);
      for (const d of p.destinations || []) {
        console.log(`    dest: ${d.id} | status: ${d.status} | remote: ${d.remote_post_id || d.remotePostId} | url: ${d.remote_post_url || d.remotePostUrl}`);
      }
    }

    const draftsRes = await fetch('http://127.0.0.1:3001/api/publishing/drafts');
    const drafts = await draftsRes.json();
    console.log('\nTotal drafts:', drafts.drafts?.length);
    const pageADrafts = drafts.drafts?.filter((d: any) => d.destinations?.some((dest: any) => dest.accountId === 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5'));
    console.log('Page A drafts count:', pageADrafts?.length);
    for (const d of (pageADrafts || [])) {
      console.log(`- Draft: ${d.id} | Rev: ${d.revision} | ${d.status} | ${d.contentType} | "${d.title}"`);
    }
    console.log('\n--- Checking draft-3d0788ac-d9f6-4382-85b6-b8a47f0f3fa2 Audit Trail ---');
    const db = (await import('better-sqlite3')).default('.data/social_command_center.db', { readonly: true });
    const draftRecord = db.prepare('SELECT * FROM publishing_drafts WHERE id = ?').get('draft-3d0788ac-d9f6-4382-85b6-b8a47f0f3fa2') as any;
    console.log('Draft Record:', { id: draftRecord.id, revision: draftRecord.revision, status: draftRecord.status, approved_revision: draftRecord.approved_revision, queued_post_id: draftRecord.queued_post_id });
    const auditRecords = db.prepare('SELECT id, draft_id, revision, action, payload_hash, created_at FROM publishing_draft_audit WHERE draft_id = ?').all('draft-3d0788ac-d9f6-4382-85b6-b8a47f0f3fa2');
    console.log('Audit records count:', auditRecords.length);
    for (const a of auditRecords) {
      console.log(' -', a);
    }
    db.close();
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
