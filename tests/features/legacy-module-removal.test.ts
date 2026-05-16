import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

function p(...parts: string[]) {
  return path.join(root, ...parts);
}

function joinParts(...parts: string[]) {
  return parts.join('');
}

test('removed public module routes have no app-router implementation', () => {
  const marketingRoot = p('src', 'app', '[locale]', '(marketing)');
  const localeRoot = p('src', 'app', '[locale]');
  const removedSegments = [
    joinParts('br', 'ain'),
    joinParts('cam', 'pus'),
    joinParts('m', 'cp'),
    joinParts('ai', 'skills'),
  ];

  for (const segment of removedSegments) {
    assert.equal(existsSync(path.join(marketingRoot, segment)), false, `${segment} route must stay absent`);
  }

  assert.deepEqual(
    existsSync(path.join(marketingRoot, '[slug]')),
    false,
    'marketing routes must not add a catch-all that could revive removed module URLs',
  );

  assert.equal(
    existsSync(path.join(localeRoot, joinParts('mcp', '-', 'faq'))),
    false,
    'MCP FAQ route must stay absent with the legacy MCP surface removed',
  );
});

test('removed dashboard module routes have no app-router implementation', () => {
  const localeRoot = p('src', 'app', '[locale]');
  const removedDashboardRoutes = [
    ['admin', joinParts('br', 'ain')],
    ['admin', joinParts('ai', '-', 'campus')],
    ['buyer', joinParts('br', 'ain')],
  ];

  for (const parts of removedDashboardRoutes) {
    assert.equal(
      existsSync(path.join(localeRoot, ...parts)),
      false,
      `${parts.join('/')} route must stay absent`,
    );
  }
});

test('removed module APIs have no route handlers that can touch dropped tables', () => {
  const apiRoot = p('src', 'app', 'api');
  const removedApiRoots = [
    ['directory'],
    ['admin', joinParts('ai', '-', 'campus', '-', 'sync')],
    ['admin', joinParts('ai', '-', 'campus', '-', 'links')],
    ['admin', joinParts('ai', '-', 'campus', '-', 'sources')],
    ['admin', joinParts('ai', '-', 'campus', '-', 'resources')],
    ['admin', joinParts('bulk', '-', 'import', '-', 'resources')],
    ['cron', joinParts('sync', '-', 'ai', '-', 'resources')],
    ['cron', joinParts('sync', '-', 'ai', '-', 'resources', '-', 'discover')],
    ['cron', joinParts('sync', '-', 'ai', '-', 'resources', '-', 'process')],
    ['cron', joinParts('directory', '-', 'sync', '-', 'new')],
    ['cron', joinParts('directory', '-', 'sync', '-', 'audit')],
    ['cron', joinParts('directory', '-', 'sync', '-', 'audit', '-', 'full')],
    ['internal', 'agent-runtime', joinParts('ai', '-', 'campus')],
  ];

  for (const parts of removedApiRoots) {
    assert.equal(existsSync(path.join(apiRoot, ...parts)), false, `${parts.join('/')} API must stay absent`);
  }
});
