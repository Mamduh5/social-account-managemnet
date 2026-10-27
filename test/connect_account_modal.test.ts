import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../client/node_modules/react/index.js';
import { renderToStaticMarkup } from '../client/node_modules/react-dom/server.node.js';
import { ConnectAccountModal, emptyAccountForm } from '../client/src/components/accounts/ConnectAccountModal.js';

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(ConnectAccountModal, {
    isOpen: true,
    onClose() {},
    categories: [],
    formData: emptyAccountForm(),
    setFormData() {},
    onSubmit() {},
    ...overrides,
  }));
}

// Inspect trusted SSR markup without a DOM, browser, app startup or transport.
function controls(html: string) {
  const stack: { name: string; markup: string }[] = [];
  const result: { name: string; markup: string; ancestors: typeof stack }[] = [];
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
  for (const match of html.matchAll(/<(\/?)([\w-]+)\b[^>]*>/g)) {
    const [, closing, name] = match;
    if (closing) {
      assert.equal(stack.pop()?.name, name, 'SSR markup nesting remains balanced');
      continue;
    }
    if (['input', 'button', 'select', 'textarea'].includes(name)) {
      result.push({ name, markup: match[0], ancestors: [...stack] });
    }
    if (!voidTags.has(name) && !/\/>$/.test(match[0])) stack.push({ name, markup: match[0] });
  }
  assert.equal(stack.length, 0);
  return result;
}

test('account actions remain inside the native form and outside its scrolling fields', () => {
  const rendered = controls(render());
  const inForm = rendered.filter((item) => item.ancestors.some((node) => node.name === 'form'));
  const actions = inForm.filter((item) => item.name === 'button');
  assert.equal(actions.length, 2, 'Cancel and Save remain accessible form actions');
  assert.ok(actions.some((item) => /type="button"/.test(item.markup)));
  assert.ok(actions.some((item) => /type="submit"/.test(item.markup)));
  for (const action of actions) {
    const formIndex = action.ancestors.findIndex((node) => node.name === 'form');
    assert.ok(!action.ancestors.slice(formIndex).some((node) => /overflow-y-auto/.test(node.markup)),
      'Actions must not scroll away with the form fields');
  }
  const required = inForm.filter((item) => /\brequired=""/.test(item.markup));
  assert.equal(required.length, 2, 'Public identity and account name keep native required validation');
  assert.ok(required.every((item) => {
    const formIndex = item.ancestors.findIndex((node) => node.name === 'form');
    return item.ancestors.slice(formIndex + 1).some((node) => /overflow-y-auto/.test(node.markup));
  }),
    'Long form fields retain their scroll container');
});

test('account saving and edit state retain disabled controls and labels', () => {
  const html = render({ saving: true, editing: true, error: 'Fixture validation error' });
  const rendered = controls(html);
  assert.match(html, /Edit Social Account/);
  assert.match(html, /Saving\.\.\./);
  assert.match(html, /role="alert"[^>]*>Fixture validation error/);
  assert.ok(rendered.some((item) => item.name === 'button' && /type="submit"/.test(item.markup) && /disabled=""/.test(item.markup)));
  assert.ok(rendered.some((item) => item.name === 'select' && /aria-label="Platform"/.test(item.markup) && /disabled=""/.test(item.markup)));
});

test('a closed account modal renders no form or actions', () => {
  assert.equal(render({ isOpen: false }), '');
});
