import { createElement } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  pre({ children, node }) {
    const code = node?.children[0];
    const language =
      code?.type === 'element'
        ? String(code.properties.className ?? '').replace(/^language-/, '')
        : '';
    return createElement(
      'div',
      { className: 'reply-code' },
      createElement('span', { className: 'reply-code-language' }, language || 'Code'),
      createElement('pre', null, children),
    );
  },
  table({ children }) {
    return createElement(
      'div',
      { className: 'reply-table', tabIndex: 0, role: 'region', 'aria-label': 'Response table' },
      createElement('table', null, children),
    );
  },
};

export function ReplyMarkdown({ text }: { text: string }) {
  return createElement(
    'div',
    { className: 'reply-markdown' },
    createElement(Markdown, { remarkPlugins: [remarkGfm], components }, text),
  );
}
