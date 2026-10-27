import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Compile only explicit CSS candidates in memory. No bundler, app, browser,
// source scanner, database or provider is involved.
const clientDir = path.resolve(__dirname, '../client');
const clientRequire = createRequire(path.join(clientDir, 'package.json'));
const { compile } = clientRequire('@tailwindcss/node');
const postcss = clientRequire('postcss');
const source = readFileSync(path.join(clientDir, 'src/index.css'), 'utf8');
const sourceAst = postcss.parse(source);
const palette: Record<string, string> = {};
sourceAst.walkRules((rule: any) => {
  if (rule.selector === ':root' || rule.selector.includes(':root.light')) {
    rule.walkDecls((decl: any) => { palette[decl.prop] = decl.value; });
  }
});

const neutralClasses = ['text-slate-100', 'text-slate-200', 'text-slate-300', 'text-slate-400', 'text-slate-500'];
const badgeCases = [
  ['text-terracotta-300', '#D95D39'], ['text-terracotta-400', '#D95D39'],
  ['text-sage-300', '#529B72'], ['text-sage-400', '#529B72'],
  ['text-honey-300', '#E29E3C'], ['text-honey-400', '#E29E3C'],
  ['text-blue-300', '#3B82F6'], ['text-blue-400', '#3B82F6'],
  ['text-rose-300', '#F43F5E'], ['text-rose-400', '#F43F5E'],
  ['text-amber-300', '#F59E0B'], ['text-emerald-300', '#10B981'],
  ['text-cyan-300', '#06B6D4'], ['text-purple-400', '#A855F7'],
  ['text-indigo-400', '#6366F1'], ['text-red-400', '#EF4444'],
];
const compiled = compile(source, { base: path.join(clientDir, 'src'), onDependency() {} })
  .then((compiler: any) => postcss.parse(compiler.build([
    ...neutralClasses, ...badgeCases.map(([name]) => name), 'text-white', 'text-slate-950',
    'hover:text-slate-100', 'focus:text-slate-100', 'light:hover:text-slate-100',
    'hover:text-white', 'disabled:opacity-50', 'bg-slate-100', 'bg-terracotta-600',
    'media-surface', 'selection:text-terracotta-200', 'light:selection:text-terracotta-700',
  ])));

function declaration(ast: any, candidate: string, property: string, light = false): string {
  const selector = `.${candidate.replaceAll(':', '\\:')}`;
  let value: string | undefined;
  let scopeCount = 0;
  ast.walkRules((rule: any) => {
    const match = light
      ? rule.selector.startsWith(selector) && rule.selector.includes(':is(.light,')
      : rule.selector === selector;
    // A light: variant plus an adaptive text utility emits two scoped rules.
    // The one with both light scopes has greater specificity than its fallback.
    const scopes = rule.selector.split(':is(.light,').length - 1;
    if (match && scopes >= scopeCount) rule.nodes.forEach((node: any) => {
      if (node.type === 'decl' && node.prop === property) {
        value = node.value;
        scopeCount = scopes;
      }
    });
  });
  assert.ok(value, `${candidate} must emit ${light ? 'light' : 'default'} ${property}`);
  return value;
}

function resolveColor(value: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  if (!name) return value;
  assert.ok(palette[name], `Light theme must define ${name}`);
  return resolveColor(palette[name]);
}

function rgb(hex: string): number[] {
  assert.match(hex, /^#[\da-f]{6}$/i);
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
}
function luminance(color: number[]): number {
  const linear = color.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function ratio(a: number[], b: number[]): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function blend(foreground: number[], background: number[], alpha: number): number[] {
  return foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));
}

test('Cozy Light neutral text retains 4.5:1 contrast on cards, feeds and hovered surfaces', async () => {
  const ast = await compiled;
  for (const candidate of neutralClasses) {
    const foreground = rgb(resolveColor(declaration(ast, candidate, 'color', true)));
    for (const surface of ['--bg-app', '--bg-surface', '--bg-surface-card', '--bg-surface-hover']) {
      assert.ok(ratio(foreground, rgb(palette[surface])) >= 4.5, `${candidate} on ${surface}`);
    }
  }
});

test('light status/platform text remains readable over tinted badges and control hovers', async () => {
  const ast = await compiled;
  for (const [candidate, tint] of badgeCases) {
    const foreground = rgb(resolveColor(declaration(ast, candidate, 'color', true)));
    for (const alpha of [0, 0.15, 0.3]) {
      const background = blend(rgb(tint), rgb(palette['--bg-surface']), alpha);
      assert.ok(ratio(foreground, background) >= 4.5, `${candidate}, tint opacity ${alpha}`);
    }
  }
  // These two explanatory paragraphs retain their existing opacity.
  for (const [candidate, opacity] of [['text-honey-400', 0.8], ['text-honey-300', 0.9]] as const) {
    const background = rgb(palette['--bg-surface']);
    const foreground = rgb(resolveColor(declaration(ast, candidate, 'color', true)));
    assert.ok(ratio(blend(foreground, background, opacity), background) >= 4.5);
  }
});

test('theme text overrides compile for hover/focus without changing dark or fixed palettes', async () => {
  const ast = await compiled;
  for (const candidate of neutralClasses) {
    assert.equal(declaration(ast, candidate, 'color'), `var(--color-${candidate.slice(5)})`);
  }
  assert.equal(declaration(ast, 'text-terracotta-400', 'color'), '#EB7E63');
  assert.equal(declaration(ast, 'text-slate-950', 'color'), 'var(--color-slate-950)');
  assert.equal(declaration(ast, 'text-white', 'color'), 'var(--color-white)');
  assert.equal(declaration(ast, 'bg-slate-100', 'background-color'), 'var(--color-slate-100)');
  assert.equal(declaration(ast, 'bg-terracotta-600', 'background-color'), '#C64E2B');
  for (const candidate of ['hover:text-slate-100', 'focus:text-slate-100', 'light:hover:text-slate-100']) {
    assert.equal(resolveColor(declaration(ast, candidate, 'color', true)), palette['--text-main']);
  }
  // These explicit selectors are light-scoped and more specific than their
  // generated default rules, so CSS order cannot restore pale text in light mode.
  const lightRules: string[] = [];
  ast.walkRules((rule: any) => {
    if (rule.selector.startsWith('.text-slate-100') && rule.selector.includes(':is(.light,')) lightRules.push(rule.selector);
  });
  assert.equal(lightRules.length, 1);
  assert.match(lightRules[0], /\[data-theme="light"\]/);
});

test('light placeholders and disabled controls use readable foreground/opacity rules', async () => {
  const ast = await compiled;
  let placeholder: any;
  let disabled: any;
  ast.walkRules((rule: any) => {
    if (rule.selector.startsWith(':is(.light,') && rule.selector.includes('::placeholder')) placeholder = rule;
    if (rule.selector.startsWith(':is(.light,') && rule.selector.endsWith(':disabled')) disabled = rule;
  });
  assert.ok(placeholder);
  assert.ok(disabled);
  const values = (rule: any) => Object.fromEntries(rule.nodes.filter((n: any) => n.type === 'decl').map((n: any) => [n.prop, n.value]));
  assert.equal(values(placeholder).opacity, '1');
  const background = rgb(palette['--bg-surface']);
  assert.ok(ratio(rgb(resolveColor(values(placeholder).color)), background) >= 4.5);
  const opacity = Number(values(disabled).opacity);
  assert.ok(opacity < 1, 'Disabled controls retain a visible disabled state');
  assert.ok(ratio(blend(rgb(palette['--text-main']), background, opacity), background) >= 4.5);
});

test('fixed dark previews, solid accent hovers and text selection retain appropriate foregrounds', async () => {
  const ast = await compiled;
  const guideForeground = rgb(declaration(ast, 'media-surface', '--text-muted'));
  const darkFrameOnLightCard = blend(rgb('#000000'), rgb(palette['--bg-surface-card']), 0.75);
  assert.ok(ratio(guideForeground, darkFrameOnLightCard) >= 4.5);
  let neutralIndex = -1;
  let whiteHoverIndex = -1;
  let selectionFound = false;
  let index = 0;
  ast.walkRules((rule: any) => {
    if (rule.selector.startsWith('.text-slate-200:is(.light,')) neutralIndex = index;
    if (rule.selector === '.hover\\:text-white:hover') whiteHoverIndex = index;
    if (rule.selector.startsWith('.light\\:selection\\:text-terracotta-700')) {
      selectionFound = true;
      assert.ok(rule.selector.indexOf(':is(.light,') < rule.selector.indexOf('::selection'));
      assert.ok(rule.nodes.some((node: any) => node.prop === 'color' && node.value === '#A33C1E'));
    }
    index++;
  });
  // Both have two class/pseudo-class specificity points. White must follow the
  // light base text for buttons whose hover background becomes solid terracotta.
  assert.ok(neutralIndex >= 0 && whiteHoverIndex > neutralIndex);
  assert.ok(selectionFound, 'Light selection styles must compile with a valid pseudo-element selector');
});
