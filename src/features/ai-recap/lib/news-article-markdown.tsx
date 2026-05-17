import type { JSX, ReactNode } from 'react';

export type NewsArticleBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'pre'; text: string };

export type NewsArticleTocItem = {
  blockIndex: number;
  id: string;
  level: 2 | 3;
  text: string;
};

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const ASCII_BAR_PATTERN = /[â–ˆâ–‘â–“â–’â– â–¡]/;

function sanitizeMarkdownHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || CONTROL_CHARACTER_PATTERN.test(trimmed) || trimmed.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'https://kode01.local');
    if (parsed.origin === 'https://kode01.local') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(value: string, keyPrefix: string = 'i'): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = value;
  let idx = 0;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)/);
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([^*]+)\*\*/);
    const underBoldMatch = remaining.match(/^([\s\S]*?)__([^_]+)__/);
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`/);

    const candidates: { pos: number; len: number; pre: string; node: ReactNode }[] = [];

    if (linkMatch) {
      const safeHref = sanitizeMarkdownHref(linkMatch[3]);
      candidates.push({
        pos: linkMatch[1].length,
        len: linkMatch[0].length,
        pre: linkMatch[1],
        node: safeHref
          ? <a key={`${keyPrefix}-${idx}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-kode01-pink hover:underline">{linkMatch[2]}</a>
          : <span key={`${keyPrefix}-${idx}`}>{linkMatch[2]}</span>,
      });
    }
    if (boldMatch) {
      candidates.push({
        pos: boldMatch[1].length,
        len: boldMatch[0].length,
        pre: boldMatch[1],
        node: <strong key={`${keyPrefix}-${idx}`} className="font-bold text-kode01-noir">{boldMatch[2]}</strong>,
      });
    }
    if (underBoldMatch) {
      candidates.push({
        pos: underBoldMatch[1].length,
        len: underBoldMatch[0].length,
        pre: underBoldMatch[1],
        node: <strong key={`${keyPrefix}-${idx}`} className="font-bold text-kode01-noir">{underBoldMatch[2]}</strong>,
      });
    }
    if (codeMatch) {
      candidates.push({
        pos: codeMatch[1].length,
        len: codeMatch[0].length,
        pre: codeMatch[1],
        node: <code key={`${keyPrefix}-${idx}`} className="bg-kode01-cream/80 px-1 py-0.5 rounded text-[0.9em] font-mono">{codeMatch[2]}</code>,
      });
    }

    if (candidates.length === 0) {
      if (remaining) parts.push(remaining);
      break;
    }

    candidates.sort((a, b) => a.pos - b.pos);
    const best = candidates[0];

    if (best.pre) parts.push(best.pre);
    parts.push(best.node);
    remaining = remaining.slice(best.len);
    idx++;
  }

  return parts;
}

function cleanInlineToString(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTableSeparator(line: string) {
  return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function slugifyHeading(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'section';
}

function uniqueHeadingId(value: string, counts: Map<string, number>): string {
  const base = slugifyHeading(value);
  const nextCount = (counts.get(base) ?? 0) + 1;
  counts.set(base, nextCount);
  return nextCount === 1 ? base : `${base}-${nextCount}`;
}

export function parseNewsArticleMarkdown(markdown: string, postTitle: string): NewsArticleBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: NewsArticleBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let calloutLines: string[] = [];
  let preLines: string[] = [];
  let firstHeadingHandled = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      blocks.push({ type: 'paragraph', text });
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ type: listType, items: [...listItems] });
    listType = null;
    listItems = [];
  };

  const flushCallout = () => {
    if (calloutLines.length === 0) return;
    blocks.push({ type: 'callout', lines: [...calloutLines] });
    calloutLines = [];
  };

  const flushPre = () => {
    if (preLines.length === 0) return;
    blocks.push({ type: 'pre', text: preLines.join('\n') });
    preLines = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushCallout();
    flushPre();
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      flushAll();
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|')) break;
        rows.push(parseTableRow(rowLine));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (ASCII_BAR_PATTERN.test(line)) {
      flushParagraph();
      flushList();
      flushCallout();
      preLines.push(rawLine);
      i++;
      continue;
    }

    if (preLines.length > 0 && line.startsWith('*') === false && /^\S.*:\s+/.test(line)) {
      preLines.push(rawLine);
      i++;
      continue;
    }
    flushPre();

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const headingText = cleanInlineToString(heading[2]);
      if (!firstHeadingHandled) {
        firstHeadingHandled = true;
        if (headingText.toLowerCase() === postTitle.trim().toLowerCase()) {
          i++;
          continue;
        }
      }
      blocks.push({ type: 'heading', level: Math.min(4, heading[1].length), text: headingText });
      i++;
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      calloutLines.push(quoteMatch[1]);
      i++;
      continue;
    }
    flushCallout();

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(unordered[1]);
      i++;
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(ordered[1]);
      i++;
      continue;
    }

    flushList();
    paragraphLines.push(line);
    i++;
  }

  flushAll();
  return blocks;
}

export function buildNewsArticleToc(blocks: NewsArticleBlock[]): NewsArticleTocItem[] {
  const counts = new Map<string, number>();
  return blocks.flatMap((block, blockIndex) => {
    if (block.type !== 'heading') return [];
    const level = block.level <= 2 ? 2 : 3;
    return [{
      blockIndex,
      id: uniqueHeadingId(block.text, counts),
      level,
      text: block.text,
    }];
  });
}

export function getRenderableNewsArticleToc(items: NewsArticleTocItem[]): NewsArticleTocItem[] {
  return items.length >= 3 ? items : [];
}

export function renderNewsArticleBlocks(
  blocks: NewsArticleBlock[],
  tocItems: NewsArticleTocItem[],
): JSX.Element {
  const headingIdsByBlockIndex = new Map(tocItems.map((item) => [item.blockIndex, item.id]));

  return (
    <div className="mt-5 sm:mt-10 space-y-3.5 sm:space-y-5 break-words">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingId = headingIdsByBlockIndex.get(index);
          if (block.level <= 2) {
            return <h2 id={headingId} key={`h-${index}`} className="scroll-mt-28 text-lg sm:text-2xl font-serif font-black mt-6 sm:mt-8">{block.text}</h2>;
          }
          return <h3 id={headingId} key={`h-${index}`} className="scroll-mt-28 text-base sm:text-xl font-serif font-black mt-5 sm:mt-6">{block.text}</h3>;
        }

        if (block.type === 'callout') {
          return (
            <blockquote key={`bq-${index}`} className="border-l-4 border-kode01-pink/60 bg-kode01-cream/50 rounded-r-xl pl-4 sm:pl-5 pr-3 sm:pr-4 py-3 sm:py-4 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
              {block.lines.map((line, li) => (
                <p key={`bq-${index}-${li}`} className={li > 0 ? 'mt-1.5' : undefined}>
                  {renderInlineMarkdown(line, `bq-${index}-${li}`)}
                </p>
              ))}
            </blockquote>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={`tbl-${index}`} className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full text-sm sm:text-base border-collapse">
                <thead>
                  <tr className="border-b-2 border-kode01-noir/15">
                    {block.headers.map((h, hi) => (
                      <th key={`th-${index}-${hi}`} className="text-left font-bold px-2 sm:px-3 py-2 text-kode01-noir/90">
                        {renderInlineMarkdown(h, `th-${index}-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={`tr-${index}-${ri}`} className={ri % 2 === 0 ? 'bg-kode01-cream/30' : ''}>
                      {row.map((cell, ci) => (
                        <td key={`td-${index}-${ri}-${ci}`} className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-kode01-noir/5 text-kode01-noir/80">
                          {renderInlineMarkdown(cell, `td-${index}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'pre') {
          return (
            <pre key={`pre-${index}`} className="overflow-x-auto bg-kode01-cream/60 border border-kode01-noir/10 rounded-xl px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm font-mono leading-relaxed text-kode01-noir/85 whitespace-pre">
              {block.text}
            </pre>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={`ol-${index}`} className="list-decimal pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${index}-${itemIndex}`}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`p-${index}`} className="text-sm sm:text-base leading-relaxed text-kode01-noir/85">
            {renderInlineMarkdown(block.text, `p-${index}`)}
          </p>
        );
      })}
    </div>
  );
}
