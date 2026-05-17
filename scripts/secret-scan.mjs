import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.mp4',
  '.mov',
  '.woff',
  '.woff2',
]);

const SECRET_PATTERNS = [
  { name: 'Stripe live secret key', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { name: 'Stripe webhook secret', regex: /\bwhsec_[A-Za-z0-9]{20,}\b/g },
  { name: 'OpenAI API key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/g },
  { name: 'Anthropic API key', regex: /\bsk-ant-api03-[A-Za-z0-9_-]{30,}\b/g },
  { name: 'GitHub token', regex: /\b(?:(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82,})\b/g },
  { name: 'Resend API key', regex: /\bre_[A-Za-z0-9]{24,}\b/g },
  { name: 'Supabase personal access token', regex: /\bsbp_[A-Za-z0-9]{20,}\b/g },
  { name: 'Supabase secret API key', regex: /\bsb_secret_[A-Za-z0-9_-]{10,}\b/g },
  { name: 'Supabase service role JWT', regex: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  {
    name: 'Hardcoded long secret token assignment',
    regex: /\b(?:[A-Z0-9_]*(?:TOKEN|SECRET)[A-Z0-9_]*|SECRET)\s*[:=]\s*["'](?=[A-Za-z0-9+/_=\-]{32,}["'])(?=[A-Za-z0-9+/_=\-]*\d)[A-Za-z0-9+/_=\-]{32,}["']/g,
  },
  {
    name: 'Hardcoded Modal agent token fallback',
    regex: /\bos\.environ\.get\(\s*["']AGENT_INTERNAL_TOKEN["']\s*,\s*["'][A-Za-z0-9_-]{32,}["']\s*\)/g,
  },
];

function listTrackedFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to list tracked files for secret scan: ${message}`);
  }
}

function shouldScan(file) {
  if (file.includes(path.sep + 'tests' + path.sep)) return false;
  const extension = path.extname(file).toLowerCase();
  if (SKIP_EXTENSIONS.has(extension)) return false;
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return Boolean(stat?.isFile()) && stat.size <= MAX_FILE_BYTES;
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const findings = [];
for (const relativeFile of listTrackedFiles()) {
  const absoluteFile = path.join(process.cwd(), relativeFile);
  if (!shouldScan(absoluteFile)) continue;

  const text = fs.readFileSync(absoluteFile, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      findings.push({
        file: relativeFile,
        line: lineForIndex(text, match.index ?? 0),
        type: pattern.name,
      });
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
  }
  process.exitCode = 1;
} else {
  console.log('Secret scan passed.');
}
