import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CommentCard } from '../client/src/components/inbox/CommentItem';
import type { CommentItem } from '../client/src/types';

// Reuse the installed client React dependencies; this suite starts no app and
// imports no server, database, network client or background worker.
const clientRequire = createRequire(path.resolve(__dirname, '../client/package.json'));
const { createElement } = clientRequire('react');
const { renderToStaticMarkup } = clientRequire('react-dom/server');

const comment: CommentItem = {
  id: 'comment-local', account_id: 'page-a', account_name: 'Page A', account_handle: '@page-a',
  platform: 'facebook', external_comment_id: 'comment-remote', author_name: 'Viewer',
  author_avatar: '/viewer.png', content: 'Question', created_time: '2026-10-27T10:00:00Z',
  like_count: 3, status: 'handled', awaiting_reply: 0, has_replied: 1,
  reply_text: 'Thanks for asking', reply_id: 'reply-remote',
};
const reply: CommentItem = {
  ...comment, id: 'reply-local', external_comment_id: 'reply-remote',
  parent_comment_id: comment.external_comment_id, author_name: 'Page A',
  content: 'Thanks for asking', created_time: '2026-10-27T10:01:00Z',
  has_replied: 0, reply_id: undefined, reply_text: undefined,
};

function render(value: CommentItem, overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(CommentCard, {
    comment: value, isReplying: false, replyText: '', replySubmitting: false, replyError: null,
    onToggleReply() {}, onReplyTextChange() {}, onSendReply() {}, onReact() {}, onStatusChange() {},
    ...overrides,
  }));
}

function occurrences(html: string, text: string) {
  return html.split(text).length - 1;
}

test('saved reply appears once before sync and once after its exact platform reply arrives', () => {
  const beforeSync = render(comment);
  const afterSync = render({ ...comment, replies: [reply] });
  for (const html of [beforeSync, afterSync]) {
    assert.equal(occurrences(html, 'Thanks for asking'), 1);
    assert.equal(occurrences(html, 'Replied by Page A:'), 1);
    assert.match(html, /3 Likes/);
    assert.match(html, /handled/);
  }
  assert.match(afterSync, /2026-10-27T10:01:00Z/);
});

test('distinct same-text replies retain their order, timestamps and parent identity', () => {
  const later = { ...reply, id: 'reply-local-2', external_comment_id: 'reply-remote-2',
    author_name: 'Another Viewer', created_time: '2026-10-27T10:02:00Z' };
  const value = { ...comment, replies: [later, reply] };
  const html = render(value);
  assert.equal(occurrences(html, 'Thanks for asking'), 2);
  assert.equal(occurrences(html, 'Replied by Page A:'), 1);
  assert.ok(html.indexOf(later.created_time) < html.indexOf(reply.created_time));
  assert.equal(value.replies[0], later);
  assert.equal(value.replies[1].parent_comment_id, comment.external_comment_id);
});

test('unrelated or unidentified same-text replies never suppress the saved receipt', () => {
  const cases = [
    { ...reply, external_comment_id: 'another-remote' },
    { ...reply, account_id: 'page-b' },
    { ...reply, platform: 'tiktok' as const },
    { ...reply, parent_comment_id: 'another-parent' },
  ];
  for (const unrelated of cases) {
    assert.equal(occurrences(render({ ...comment, replies: [unrelated] }), 'Thanks for asking'), 2);
  }
  assert.equal(occurrences(render({ ...comment, reply_id: undefined, replies: [reply] }), 'Thanks for asking'), 2);
});

test('platform reply content and timestamp remain authoritative while the composer is submitting', () => {
  const html = render({ ...comment, replies: [{ ...reply, content: 'Updated remote reply' }] }, {
    isReplying: true, replyText: 'Next reply', replySubmitting: true,
  });
  assert.equal(occurrences(html, 'Updated remote reply'), 1);
  assert.equal(occurrences(html, 'Thanks for asking'), 0);
  assert.match(html, /2026-10-27T10:01:00Z/);
  assert.match(html, /Next reply/);
  assert.match(html, /Sending/);
  assert.match(html, /disabled/);
});
