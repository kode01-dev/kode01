import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const secretScanScript = path.join(root, 'scripts', 'secret-scan.mjs');

function makeTempGitRepo() {
  const tempRoot = path.join(root, 'tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const repo = fs.mkdtempSync(path.join(tempRoot, 'secret-scan-'));
  spawnSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

test('secret scan blocks committed GitHub tokens', () => {
  const repo = makeTempGitRepo();

  try {
    const file = path.join(repo, 'merge_prs.ps1');
    const fakeGitHubToken = `ghp_${'A'.repeat(36)}`;
    fs.writeFileSync(file, `$token = "${fakeGitHubToken}"\n`);
    const add = spawnSync('git', ['add', 'merge_prs.ps1'], { cwd: repo, encoding: 'utf8' });
    assert.equal(add.status, 0, add.stderr);

    const scan = spawnSync(process.execPath, [secretScanScript], { cwd: repo, encoding: 'utf8' });

    assert.equal(scan.status, 1);
    assert.match(scan.stderr, /merge_prs\.ps1:1 GitHub token/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('secret scan blocks hardcoded Modal agent token fallbacks', () => {
  const repo = makeTempGitRepo();

  try {
    const file = path.join(repo, 'trigger_recap.py');
    const fakeAgentToken = `${'a'.repeat(31)}1`;
    fs.writeFileSync(
      file,
      `import os\nSECRET = os.environ.get("AGENT_INTERNAL_TOKEN", "${fakeAgentToken}")\n`,
    );
    const add = spawnSync('git', ['add', 'trigger_recap.py'], { cwd: repo, encoding: 'utf8' });
    assert.equal(add.status, 0, add.stderr);

    const scan = spawnSync(process.execPath, [secretScanScript], { cwd: repo, encoding: 'utf8' });

    assert.equal(scan.status, 1);
    assert.match(scan.stderr, /trigger_recap\.py:2 Hardcoded Modal agent token fallback/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
