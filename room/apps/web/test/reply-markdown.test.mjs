import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReplyMarkdown } from '../src/components/reply-markdown.ts';

function render(text) {
  return renderToStaticMarkup(createElement(ReplyMarkdown, { text }));
}

test('renders response headings, emphasis, lists, links, and inline code semantically', () => {
  const html = render(
    '# Heading\n\n**Bold** and *italic* with `code`.\n\n- First\n  - Nested\n\n1. Step\n\n> Quote\n\n[Docs](https://example.com/docs)',
  );
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul>\s*<li>First\s*<ul>/);
  assert.match(html, /<ol>\s*<li>Step<\/li>/);
  assert.match(html, /<blockquote>\s*<p>Quote<\/p>/);
  assert.match(html, /<a href="https:\/\/example.com\/docs">Docs<\/a>/);
});

test('renders GitHub-flavored tables, task lists, and strikethrough', () => {
  const html = render(
    '| Name | Result |\n| --- | --- |\n| A | **Pass** |\n\n- [x] Done\n\n~~Old~~',
  );
  assert.match(html, /class="reply-table" tabindex="0" role="region" aria-label="Response table"/);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td><strong>Pass<\/strong><\/td>/);
  assert.match(html, /type="checkbox" disabled="" checked=""/);
  assert.match(html, /<del>Old<\/del>/);
});

test('preserves fenced code and partial streamed fences without parsing code as prose', () => {
  for (const text of [
    'Before\n\n```ts\nconst x = "**literal**";\n```\n\nAfter',
    'Before\n\n```ts\nconst x = "**literal**";',
    'Before\n\n~~~ts\nconst x = "**literal**";',
  ]) {
    const html = render(text);
    assert.match(html, /class="reply-code-language">ts<\/span>/);
    assert.match(html, /<pre><code class="language-ts">const x = &quot;\*\*literal\*\*&quot;;/);
    assert.doesNotMatch(html, /<strong>literal/);
  }
  assert.match(render('````js\n```\n~~~\n````'), /<code class="language-js">```\n~~~\n<\/code>/);
});

test('keeps raw HTML inert and blocks executable link protocols', () => {
  const html = render(
    '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[Bad](javascript:alert%281%29)\n\n[Good](https://example.com)',
  );
  assert.doesNotMatch(html, /<script|<img|href="javascript:/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<a href="">Bad<\/a>/);
  assert.match(html, /href="https:\/\/example.com"/);
});
