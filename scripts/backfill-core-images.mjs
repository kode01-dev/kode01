#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const MAX_LONG_EDGE = 1600;
const WEBP_QUALITY = 78;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

const TARGETS = [
  { table: 'ad_creatives', column: 'image_url', bucket: 'covers', pathPrefix: 'backfill/ads' },
  { table: 'editorial_posts', column: 'cover_image_url', bucket: 'editorial', pathPrefix: 'backfill/editorial' },
];

function parseArgs(argv) {
  const hasDryRun = argv.includes('--dry-run');
  const hasApply = argv.includes('--apply');
  if (hasDryRun === hasApply) {
    throw new Error('Use exactly one mode: --dry-run or --apply');
  }
  return { mode: hasDryRun ? 'dry-run' : 'apply' };
}

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sanitizePathSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function buildStoragePath(pathPrefix, rowId) {
  const prefix = sanitizePathSegment(pathPrefix) || 'backfill';
  return `${prefix}/${Date.now()}-${rowId}-${randomUUID()}.webp`;
}

function isLocalHttpHost(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local')
  );
}

function assertAcceptedSourceUrl(value) {
  const parsed = new URL(value);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'https:') return parsed;
  if (protocol === 'http:' && isLocalHttpHost(parsed.hostname.toLowerCase())) return parsed;
  throw new Error('Source URL must be HTTPS (HTTP allowed only for localhost/.local).');
}

function isOptimizedPublicStorageUrl(url, bucket) {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    return parsed.pathname.includes(marker) && parsed.pathname.toLowerCase().endsWith('.webp');
  } catch {
    return false;
  }
}

async function fetchImageBytes(sourceUrl) {
  const parsed = assertAcceptedSourceUrl(sourceUrl);
  const response = await fetch(parsed, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Fetched content is not an image (${contentType || 'unknown'})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length <= 0) throw new Error('Fetched image is empty');
  if (buffer.length > MAX_INPUT_BYTES) throw new Error(`Image exceeds ${MAX_INPUT_BYTES} bytes`);
  return buffer;
}

async function toWebp(sourceBuffer) {
  const outputBuffer = await sharp(sourceBuffer, { failOn: 'none', limitInputPixels: 10000 * 10000 })
    .rotate()
    .resize({
      width: MAX_LONG_EDGE,
      height: MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  if (outputBuffer.length <= 0) throw new Error('Conversion produced empty output');
  return outputBuffer;
}

async function countNonOptimizedRows(client, config) {
  const { data, error } = await client
    .from(config.table)
    .select(`id,${config.column}`)
    .not(config.column, 'is', null)
    .neq(config.column, '');

  if (error) throw new Error(`${config.table} count query failed: ${error.message}`);

  return (data ?? []).filter((row) => !isOptimizedPublicStorageUrl(row[config.column], config.bucket)).length;
}

async function run() {
  const { mode } = parseArgs(process.argv.slice(2));
  loadEnvFileIfPresent(path.resolve('.env.local'));
  loadEnvFileIfPresent(path.resolve('.env'));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report = {
    mode,
    startedAt: new Date().toISOString(),
    config: {
      maxLongEdge: MAX_LONG_EDGE,
      webpQuality: WEBP_QUALITY,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
      maxInputBytes: MAX_INPUT_BYTES,
    },
    targets: [],
    summary: {
      scanned: 0,
      updated: 0,
      skippedAlreadyOptimized: 0,
      dryRunReady: 0,
      failed: 0,
    },
    remainingNonOptimizedAfterApply: {},
  };

  for (const config of TARGETS) {
    const { data, error } = await supabaseAdmin
      .from(config.table)
      .select(`id,${config.column}`)
      .not(config.column, 'is', null)
      .neq(config.column, '');

    if (error) {
      throw new Error(`Failed to read ${config.table}.${config.column}: ${error.message}`);
    }

    const rows = data ?? [];
    const targetReport = {
      table: config.table,
      column: config.column,
      bucket: config.bucket,
      scanned: rows.length,
      rows: [],
    };

    for (const row of rows) {
      const id = String(row.id);
      const beforeUrl = String(row[config.column] ?? '').trim();
      if (!beforeUrl) continue;

      report.summary.scanned += 1;

      if (isOptimizedPublicStorageUrl(beforeUrl, config.bucket)) {
        report.summary.skippedAlreadyOptimized += 1;
        targetReport.rows.push({
          id,
          status: 'skipped_already_optimized',
          beforeUrl,
          afterUrl: beforeUrl,
        });
        continue;
      }

      try {
        const inputBytes = await fetchImageBytes(beforeUrl);
        const outputBytes = await toWebp(inputBytes);
        if (mode === 'dry-run') {
          report.summary.dryRunReady += 1;
          targetReport.rows.push({
            id,
            status: 'dry_run_ready',
            beforeUrl,
            afterUrl: null,
            plannedPath: buildStoragePath(config.pathPrefix, id),
            sourceBytes: inputBytes.length,
            outputBytes: outputBytes.length,
          });
          continue;
        }

        const uploadPath = buildStoragePath(config.pathPrefix, id);
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from(config.bucket)
          .upload(uploadPath, outputBytes, {
            contentType: 'image/webp',
            upsert: false,
          });

        if (uploadError || !uploadData) {
          throw new Error(uploadError?.message ?? 'Storage upload failed');
        }

        const { data: publicUrlData } = supabaseAdmin.storage
          .from(config.bucket)
          .getPublicUrl(uploadData.path);
        const afterUrl = publicUrlData?.publicUrl;
        if (!afterUrl) {
          throw new Error('Unable to resolve public URL after upload');
        }

        const { error: updateError } = await supabaseAdmin
          .from(config.table)
          .update({ [config.column]: afterUrl })
          .eq('id', id);
        if (updateError) {
          throw new Error(updateError.message);
        }

        report.summary.updated += 1;
        targetReport.rows.push({
          id,
          status: 'updated',
          beforeUrl,
          afterUrl,
          storagePath: uploadData.path,
          sourceBytes: inputBytes.length,
          outputBytes: outputBytes.length,
        });
      } catch (error) {
        report.summary.failed += 1;
        targetReport.rows.push({
          id,
          status: 'failed',
          beforeUrl,
          afterUrl: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    report.targets.push(targetReport);
  }

  if (mode === 'apply') {
    for (const config of TARGETS) {
      report.remainingNonOptimizedAfterApply[`${config.table}.${config.column}`] = await countNonOptimizedRows(
        supabaseAdmin,
        config,
      );
    }
  }

  report.finishedAt = new Date().toISOString();
  await fsp.mkdir(path.resolve('tmp'), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.resolve('tmp', `backfill-core-images-${mode}-${timestamp}.json`);
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`[backfill-core-images] mode=${mode}`);
  console.log(`[backfill-core-images] scanned=${report.summary.scanned}`);
  console.log(`[backfill-core-images] updated=${report.summary.updated}`);
  console.log(`[backfill-core-images] dryRunReady=${report.summary.dryRunReady}`);
  console.log(`[backfill-core-images] skippedAlreadyOptimized=${report.summary.skippedAlreadyOptimized}`);
  console.log(`[backfill-core-images] failed=${report.summary.failed}`);
  if (mode === 'apply') {
    console.log('[backfill-core-images] remainingNonOptimizedAfterApply=');
    console.log(report.remainingNonOptimizedAfterApply);
  }
  console.log(`[backfill-core-images] report=${reportPath}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[backfill-core-images] fatal:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
