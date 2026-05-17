const TRAILING_SOURCE_CREDIT_PATTERN =
  /^\s*(?:[*_]{1,2})?\s*(?:sources?|references?|références?)\s*(?:[*_]{1,2})?\s*[:：]\s*(?:[*_]{1,2})?\s*\S.*?(?:[*_]{1,2})?\s*$/i;

function isGeneratedSourceCreditLine(line: string): boolean {
  return TRAILING_SOURCE_CREDIT_PATTERN.test(line.trim());
}

export function stripTrailingGeneratedSourceCredit(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let lastContentLineIndex = lines.length - 1;

  while (lastContentLineIndex >= 0 && lines[lastContentLineIndex].trim() === '') {
    lastContentLineIndex--;
  }

  if (lastContentLineIndex < 0 || !isGeneratedSourceCreditLine(lines[lastContentLineIndex])) {
    return markdown;
  }

  const keptLines = lines.slice(0, lastContentLineIndex);
  while (keptLines.length > 0 && keptLines[keptLines.length - 1].trim() === '') {
    keptLines.pop();
  }

  return keptLines.join('\n');
}
