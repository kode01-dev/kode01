import React from 'react';
import { cn } from '@/lib/utils';

type EditorialBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const ALLOWED_MARKDOWN_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const BLOCKED_MARKDOWN_LINK_FALLBACK = '#';

function extractMarkdownLinkProtocol(value: string): string | null {
  const normalized = value.replace(/[\u0000-\u001F\u007F\s]+/g, '');
  const match = normalized.match(/^([a-z][a-z0-9+.-]*:)/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

function decodeForProtocolInspection(value: string): string {
  let candidate = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return candidate;
}

export function normalizeMarkdownLinkTarget(href: string, relativeLinkBase?: string | null): string {
  const value = href.trim();
  if (!value) return BLOCKED_MARKDOWN_LINK_FALLBACK;
  if (value.startsWith('#')) return value;

  if (value.startsWith('//')) return BLOCKED_MARKDOWN_LINK_FALLBACK;

  const protocol = extractMarkdownLinkProtocol(decodeForProtocolInspection(value));
  if (protocol && !ALLOWED_MARKDOWN_LINK_PROTOCOLS.has(protocol)) {
    return BLOCKED_MARKDOWN_LINK_FALLBACK;
  }

  if (protocol) return value;
  if (!relativeLinkBase) return value;

  const normalizedBase = relativeLinkBase.trim().replace(/\/+$/, '');
  if (!normalizedBase) return value;
  const sanitized = value
    .replace(/^\.\/+/g, '')
    .replace(/^(?:\.\.\/)+/g, '')
    .replace(/^\/+/g, '');
  if (!sanitized) return normalizedBase;
  return `${normalizedBase}/${sanitized}`;
}

function parseInlineMarkdown(text: string, keyPrefix: string, relativeLinkBase?: string | null): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    if (match[2] && match[3]) {
      const href = normalizeMarkdownLinkTarget(match[3], relativeLinkBase);
      nodes.push(
        <a
          key={`${keyPrefix}-a-${keyIndex++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-kode01-pink underline underline-offset-2 break-words"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${keyIndex++}`} className="font-black">
          {match[4]}
        </strong>,
      );
    } else if (match[5]) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${keyIndex++}`}
          className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.92em]"
        >
          {match[5]}
        </code>,
      );
    } else if (match[6]) {
      nodes.push(
        <em key={`${keyPrefix}-i-${keyIndex++}`} className="italic">
          {match[6]}
        </em>,
      );
    } else {
      nodes.push(match[0]);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isTableHeaderLine(line: string): boolean {
  return /^\|.+\|\s*$/.test(line);
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?\s*:?-{3,}\s*(\|\s*:?-{3,}\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  const raw = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return raw.split('|').map((cell) => cleanLine(cell));
}

export function parseEditorialMarkdown(markdown: string): EditorialBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: EditorialBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let idx = 0;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = cleanLine(paragraphLines.join(' '));
    if (text.length > 0) blocks.push({ type: 'paragraph', text });
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

  while (idx < lines.length) {
    const line = lines[idx].trim();
    if (!line) {
      flushParagraph();
      flushList();
      idx += 1;
      continue;
    }

    const nextLine = idx + 1 < lines.length ? lines[idx + 1].trim() : '';
    if (isTableHeaderLine(line) && isTableSeparatorLine(nextLine)) {
      flushParagraph();
      flushList();
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      idx += 2;
      while (idx < lines.length) {
        const rowLine = lines[idx].trim();
        if (!rowLine) break;
        if (!isTableHeaderLine(rowLine)) break;
        rows.push(parseTableRow(rowLine));
        idx += 1;
      }
      if (headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: Math.min(3, heading[1].length), text: cleanLine(heading[2]) });
      idx += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', text: cleanLine(quote[1]) });
      idx += 1;
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(cleanLine(unordered[1]));
      idx += 1;
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(cleanLine(ordered[1]));
      idx += 1;
      continue;
    }

    flushList();
    paragraphLines.push(line);
    idx += 1;
  }

  flushParagraph();
  flushList();

  return blocks;
}

export function EditorialMarkdown({
  markdown,
  className,
  relativeLinkBase,
}: {
  markdown: string;
  className?: string;
  relativeLinkBase?: string | null;
}) {
  const blocks = parseEditorialMarkdown(markdown);
  if (blocks.length === 0) {
    return <p className="text-sm text-kode01-noir/50">No content yet.</p>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const HeadingTag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
          return (
            <HeadingTag
              key={`h-${index}`}
              className={cn(
                'font-serif font-black tracking-tight',
                block.level === 1 && 'text-3xl',
                block.level === 2 && 'text-2xl',
                block.level === 3 && 'text-xl',
              )}
            >
              {parseInlineMarkdown(block.text, `heading-${index}`, relativeLinkBase)}
            </HeadingTag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={`q-${index}`}
              className="border-l-4 border-kode01-pink/60 bg-kode01-cream/60 px-4 py-3 text-kode01-noir/85 italic"
            >
              {parseInlineMarkdown(block.text, `quote-${index}`, relativeLinkBase)}
            </blockquote>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-2 text-base leading-relaxed text-kode01-noir/85">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`}>
                  {parseInlineMarkdown(item, `ul-${index}-${itemIndex}`, relativeLinkBase)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={`ol-${index}`} className="list-decimal pl-5 space-y-2 text-base leading-relaxed text-kode01-noir/85">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${index}-${itemIndex}`}>
                  {parseInlineMarkdown(item, `ol-${index}-${itemIndex}`, relativeLinkBase)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={`table-${index}`} className="overflow-x-auto rounded-2xl border border-black/10 bg-white/80">
              <table className="min-w-full text-sm text-kode01-noir/85">
                <thead className="bg-kode01-noir/5">
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`th-${index}-${headerIndex}`}
                        className="whitespace-nowrap border-b border-black/10 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-kode01-noir"
                      >
                        {parseInlineMarkdown(header, `th-${index}-${headerIndex}`, relativeLinkBase)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`tr-${index}-${rowIndex}`} className="border-b border-black/5 last:border-b-0">
                      {row.map((cell, cellIndex) => (
                        <td key={`td-${index}-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-xs leading-relaxed">
                          {parseInlineMarkdown(cell, `td-${index}-${rowIndex}-${cellIndex}`, relativeLinkBase)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={`p-${index}`} className="text-base leading-relaxed text-kode01-noir/85">
            {parseInlineMarkdown(block.text, `paragraph-${index}`, relativeLinkBase)}
          </p>
        );
      })}
    </div>
  );
}
