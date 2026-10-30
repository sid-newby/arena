import { createHash } from 'node:crypto';

export type Narration =
  | { status: 'ready'; revision: string; segments: string[] }
  | { status: 'unavailable'; reason: string };

export function containsSourceCode(text: string): boolean {
  return (
    /(?:^|\n)\s*(?:(?:>\s*)?(?:`{3,}|~{3,})|(?:export\s+)?(?:const|let|var|function|class|import|interface|type)\s+\w+|(?:return|throw)\s+.+;)/m.test(
      text,
    ) ||
    /\b(?:const|let|var)\s+\w+\s*=/.test(text) ||
    /\b[A-Za-z_$][\w.$]*\s*=\s*[^=\n]+;/.test(text) ||
    /\b(?:console\.\w+|print)\s*\(\s*["'][^"'\n]*["']\s*\)\s*;?/.test(text) ||
    /\bselect\s+.+?\s+from\s+[\w.]+\s*;/i.test(text)
  );
}

function spokenText(markdown: string): string {
  let fence: { marker: string; length: number } | undefined;
  const lines: string[] = [];
  for (const line of markdown.split('\n')) {
    const fenceLine = line.replace(/^(?:\s*>\s*)*/, '').replace(/^\s*(?:[-*+] |\d+[.)] )?/, '');
    const opening = fenceLine.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (
        opening &&
        opening[1][0] === fence.marker &&
        opening[1].length >= fence.length &&
        !fenceLine.slice(opening[1].length).trim()
      )
        fence = undefined;
      continue;
    }
    if (opening) {
      fence = { marker: opening[1][0], length: opening[1].length };
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) continue;
    lines.push(line);
  }
  return lines
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .trim();
}

export function narration(summary: string | undefined): Narration {
  if (!summary?.trim()) return { status: 'unavailable', reason: 'No spoken summary was provided.' };
  if (containsSourceCode(summary))
    return { status: 'unavailable', reason: 'The spoken summary contains possible source code.' };
  let unsafeInline = false;
  const unwrapped = summary.replace(
    /(`+)([^`\n]+)\1/g,
    (_match, _marker: string, content: string) => {
      if (!/^[\p{L}\p{N}\s_@./,'’%()-]+$/u.test(content)) unsafeInline = true;
      return content;
    },
  );
  if (unsafeInline || unwrapped.includes('`'))
    return {
      status: 'unavailable',
      reason: 'The spoken summary contains inline content that cannot be safely spoken.',
    };
  let tail = spokenText(unwrapped);
  if (!tail) return { status: 'unavailable', reason: 'The spoken summary has no speakable text.' };
  const segments: string[] = [];
  while (tail) {
    let length = tail.length;
    if (length > 350) {
      const lastSentence = [...tail.slice(0, 351).matchAll(/[.!?](?=\s)/g)].at(-1);
      length = lastSentence
        ? lastSentence.index + 1
        : tail.lastIndexOf(' ', 350) > 0
          ? tail.lastIndexOf(' ', 350)
          : 350;
    }
    segments.push(tail.slice(0, length).trim());
    tail = tail.slice(length).trimStart();
  }
  const revision = createHash('sha256').update(JSON.stringify(segments)).digest('hex');
  return { status: 'ready', revision, segments };
}
