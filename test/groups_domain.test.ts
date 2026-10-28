import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalGroupIdentity, defaultGroupEligibility, groupReadiness, groupReceiptMatchesThread, parseGroupThreadIdentity, type GroupMembershipStatus } from '../server/src/domain/groups.js';

test('Group URL variants normalize to one stable numeric identity while preserving input', () => {
  for (const input of ['https://facebook.com/groups/12345', 'https://www.facebook.com/groups/12345/?ref=share#ignored', 'https://m.facebook.com/groups/12345/posts/789?comment_id=10']) {
    const identity = canonicalGroupIdentity(input);
    assert.equal(identity.canonicalKey, 'id:12345');
    assert.equal(identity.canonicalUrl, 'https://www.facebook.com/groups/12345/');
    assert.equal(identity.originalUrl, input);
  }
});

test('Vanity identity casing normalizes without guessing numeric aliases', () => {
  assert.equal(canonicalGroupIdentity('https://www.facebook.com/groups/Our.Group/').canonicalKey, 'slug:our.group');
  assert.notEqual(canonicalGroupIdentity('https://www.facebook.com/groups/123/').canonicalKey, canonicalGroupIdentity('https://www.facebook.com/groups/our.group/').canonicalKey);
});

test('Group identities reject unsupported hosts, credentials, reserved paths and ambiguous encoded paths', () => {
  for (const input of ['http://facebook.com/groups/1', 'https://facebook.com.evil.example/groups/1', 'https://evil@facebook.com/groups/1', 'https://facebook.com:3443/groups/1', 'https://facebook.com/groups/search', 'https://facebook.com/groups/discover', 'https://facebook.com/groups/1/../../groups/2', 'https://facebook.com/groups/%31', 'https://facebook.com/groups/one%2Ftwo', 'https://facebook.com/groups/one//posts/2', 'https://facebook.com/groups/one/members', 'https://facebook.com/groups/one/posts/2/extra']) assert.throws(() => canonicalGroupIdentity(input), input);
});

test('Thread identity normalizes posts/permalink variants and retains explicit comment targets', () => {
  const thread = parseGroupThreadIdentity('https://m.facebook.com/groups/Our.Group/permalink/789/?comment_id=100&reply_comment_id=101&ref=share');
  assert.equal(thread.canonicalKey, 'slug:our.group'); assert.equal(thread.postId, '789');
  assert.equal(thread.commentId, '100'); assert.equal(thread.replyCommentId, '101');
  assert.throws(() => parseGroupThreadIdentity('https://www.facebook.com/groups/123/'));
  assert.throws(() => parseGroupThreadIdentity('https://www.facebook.com/groups/123/posts/456?comment_id=1&comment_id=2'), /unambiguous/);
});

test('Reply receipts require the same post and any captured comment/reply target', () => {
  const thread = 'https://www.facebook.com/groups/123/posts/456?comment_id=10';
  assert.equal(groupReceiptMatchesThread(thread, 'https://m.facebook.com/groups/123/permalink/456?comment_id=10&reply_comment_id=11'), true);
  assert.equal(groupReceiptMatchesThread(thread, 'https://facebook.com/groups/123/posts/999?comment_id=10'), false);
  assert.equal(groupReceiptMatchesThread(thread, 'https://facebook.com/groups/123/posts/456?comment_id=20'), false);
  assert.equal(groupReceiptMatchesThread(thread, 'https://facebook.com/groups/123/posts/456'), false);
  assert.equal(groupReceiptMatchesThread(thread + '&reply_comment_id=11', thread + '&reply_comment_id=12'), true);
  assert.equal(groupReceiptMatchesThread(thread, 'https://facebook.com/groups/vanity/posts/456?comment_id=10'), false);
});

test('A reply to a post requires the resulting comment rather than the unchanged post URL', () => {
  const post = 'https://www.facebook.com/groups/123/posts/456';
  assert.equal(groupReceiptMatchesThread(post, post), false);
  assert.equal(groupReceiptMatchesThread(post, `${post}/?ref=share`), false);
  assert.equal(groupReceiptMatchesThread(post, `${post}?comment_id=10`), true);
  assert.equal(groupReceiptMatchesThread(post, 'https://m.facebook.com/groups/123/permalink/456/?comment_id=10&reply_comment_id=11'), true);
  assert.equal(groupReceiptMatchesThread(post, 'https://www.facebook.com/groups/123/posts/999?comment_id=10'), false);
  assert.equal(groupReceiptMatchesThread(post, 'https://www.facebook.com/groups/other/posts/456?comment_id=10'), false);
});

test('A reply to a captured parent requires a distinct result and retains the parent context', () => {
  const post = 'https://www.facebook.com/groups/123/posts/456';
  const parent = `${post}?comment_id=10`;
  assert.equal(groupReceiptMatchesThread(parent, parent), false);
  assert.equal(groupReceiptMatchesThread(parent, post), false);
  assert.equal(groupReceiptMatchesThread(parent, `${post}?comment_id=10&reply_comment_id=11`), true);
  assert.equal(groupReceiptMatchesThread(parent, `${post}?comment_id=20&reply_comment_id=11`), false);
  assert.equal(groupReceiptMatchesThread(parent, `${post}?comment_id=11`), false);
});

test('Nested reply receipts identify a new result under the saved root or explicit target', () => {
  const post = 'https://www.facebook.com/groups/123/posts/456';
  const target = `${post}?comment_id=10&reply_comment_id=11`;
  assert.equal(groupReceiptMatchesThread(target, target), false);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=10`), false);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=10&reply_comment_id=12`), true);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=11&reply_comment_id=12`), true);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=20&reply_comment_id=12`), false);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=10&reply_comment_id=11&ref=changed`), false);
  assert.equal(groupReceiptMatchesThread(target, `${post}?comment_id=12`), false);
});

test('Comment references reject missing or ambiguous parent/result identities', () => {
  const post = 'https://www.facebook.com/groups/123/posts/456';
  for (const query of ['reply_comment_id=11', 'comment_id=10&reply_comment_id=10', 'comment_id=10&reply_comment_id=11&reply_comment_id=12', 'comment_id=10&comment_id=20&reply_comment_id=11']) {
    assert.throws(() => parseGroupThreadIdentity(`${post}?${query}`), /unambiguous/);
  }
});

const readyInput = () => ({ identityType: 'page' as const, membership: 'member' as GroupMembershipStatus,
  eligibility: { ...defaultGroupEligibility(), pagesCanJoin: 'yes' as const, participationApproval: 'not_required' as const, postModeration: 'required' as const },
  rules: 'Owner reviewed: no unsolicited promotions.', rulesReviewedAt: '2026-10-27', reviewedAt: '2026-10-27T10:00:00.000Z', archivedAt: null, actingPageAvailable: true });

test('Membership alone never implies permission to post or completed readiness', () => {
  const readiness = groupReadiness({ ...readyInput(), eligibility: defaultGroupEligibility() });
  assert.equal(readiness.membershipAllowsParticipation, true); assert.equal(readiness.state, 'needs_review');
  assert.equal(readiness.publishingPermission, 'owner_review_required'); assert.equal(readiness.verified, false);
  assert.ok(readiness.reasons.some(reason => /Pages/.test(reason)));
});

test('A completed owner review stays informational even with post moderation recorded', () => {
  const readiness = groupReadiness(readyInput());
  assert.equal(readiness.state, 'reviewed_for_manual_handoff');
  assert.equal(readiness.publishingPermission, 'owner_review_required'); assert.equal(readiness.verified, false);
});

test('All non-member lifecycle states and restrictions remain distinct and unready', () => {
  for (const membership of ['unknown', 'not_member', 'request_pending', 'request_rejected', 'request_withdrawn', 'participation_restricted'] as const) {
    const readiness = groupReadiness({ ...readyInput(), membership });
    assert.equal(readiness.state, 'not_ready', membership); assert.equal(readiness.membershipAllowsParticipation, false, membership);
  }
  assert.equal(groupReadiness({ ...readyInput(), membership: 'admin' }).state, 'reviewed_for_manual_handoff');
  assert.equal(groupReadiness({ ...readyInput(), eligibility: { ...readyInput().eligibility, participationApproval: 'required' } }).state, 'not_ready');
});

test('Archived/unavailable Pages cannot appear ready and personal handoffs require native identity review', () => {
  assert.equal(groupReadiness({ ...readyInput(), archivedAt: '2026-10-27' }).state, 'not_ready');
  assert.equal(groupReadiness({ ...readyInput(), actingPageAvailable: false }).state, 'not_ready');
  const personal = groupReadiness({ ...readyInput(), identityType: 'personal' });
  assert.equal(personal.state, 'needs_review'); assert.match(personal.reasons.join(' '), /Personal identity/);
});
