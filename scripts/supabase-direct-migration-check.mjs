import fs from 'node:fs';
import path from 'node:path';

const TARGET_PROJECT_REF = 'noemwcxtlibtimusldyn';
const OLD_PROJECT_REF = 'zboonzqhrbuueqqzzrgn';

const REQUIRED_ABSENT_PATHS = [
  'supabase/functions/directory-sync-cron',
];

const ACTIVE_SCAN_ROOTS = [
  'src',
  'services/modal-agent-runtime',
  'supabase/functions',
  'supabase/config.toml',
  '.env.example',
];

const ACTIVE_FORBIDDEN_PATTERNS = [
  { name: 'old Supabase project ref', regex: /zboonzqhrbuueqqzzrgn/g },
  { name: 'AI Campus flow slug', regex: /\bai-campus\b/gi },
  { name: 'directory sync cron function', regex: /\bdirectory-sync-cron\b/gi },
  { name: 'Brain/Campus table: modules_directory', regex: /\bmodules_directory\b/g },
  { name: 'Brain/Campus table: ai_resources', regex: /\bai_resources\b/g },
  { name: 'Brain/Campus table: ai_campus_sources', regex: /\bai_campus_sources\b/g },
  { name: 'Brain/Campus bucket: resources-covers', regex: /\bresources-covers\b/g },
];

const SKIP_EXTENSIONS = new Set(['.pyc', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz']);

const failures = [];

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function listFiles(entry) {
  const normalizedEntry = normalizePath(entry);
  const stat = fs.statSync(normalizedEntry, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [normalizedEntry];
  if (!stat.isDirectory()) return [];

  const files = [];
  const children = fs.readdirSync(normalizedEntry, { withFileTypes: true });
  for (const child of children) {
    if (child.name === 'node_modules' || child.name === '.next' || child.name === '__pycache__') continue;
    const childPath = `${normalizedEntry}/${child.name}`;
    if (child.isDirectory()) {
      files.push(...listFiles(childPath));
    } else if (child.isFile()) {
      files.push(childPath);
    }
  }

  return files;
}

function shouldScan(file) {
  if (file.includes('/node_modules/') || file.includes('/.next/')) return false;
  if (file.includes('/__pycache__/')) return false;
  if (SKIP_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
  return ACTIVE_SCAN_ROOTS.some((entry) => file === entry || file.startsWith(`${entry}/`));
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const configText = readText('supabase/config.toml');
assert(
  configText.includes(`project_id = "${TARGET_PROJECT_REF}"`),
  `supabase/config.toml must target ${TARGET_PROJECT_REF}.`,
);
assert(
  !configText.includes(OLD_PROJECT_REF),
  'supabase/config.toml still references the old Supabase project.',
);

const envExample = readText('.env.example');
assert(
  envExample.includes(`https://${TARGET_PROJECT_REF}.supabase.co`),
  '.env.example must point Supabase URL examples at the target project.',
);
assert(
  !envExample.includes(OLD_PROJECT_REF),
  '.env.example still references the old Supabase project.',
);
assert(
  envExample.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='),
  '.env.example must document NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
);

for (const absentPath of REQUIRED_ABSENT_PATHS) {
  assert(!fs.existsSync(absentPath), `${absentPath} must not exist in the migrated app.`);
}

const files = ACTIVE_SCAN_ROOTS.flatMap(listFiles).map(normalizePath).filter(shouldScan);
for (const file of files) {
  const absolutePath = path.join(process.cwd(), file);
  const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > 2 * 1024 * 1024) continue;

  const text = readText(absolutePath);
  for (const pattern of ACTIVE_FORBIDDEN_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      failures.push(`${file}:${lineForIndex(text, match.index ?? 0)} ${pattern.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Supabase direct migration check failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Supabase direct migration check passed for ${TARGET_PROJECT_REF}.`);
