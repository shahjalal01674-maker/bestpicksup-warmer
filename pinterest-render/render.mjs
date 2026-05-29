// Node-side Pinterest pin renderer. Runs in GitHub Actions on a 30-min cron.
//
// Why: CF Workers Free tier caps CPU at 10ms per request. Satori + resvg-js
// rendering needs 200-500ms. So we offload rendering to a GH Actions Node
// runner. Same templates, same fonts, same output — just executed in a
// 30s-CPU environment instead of a 10ms one.
//
// Workflow:
//   1. GET worker /api/admin/render-queue — get pending pins
//   2. For each pin:
//      a. Build the template tree (plain JS object — no JSX)
//      b. satori → SVG → resvg → PNG
//      c. Upload PNG to R2 via S3-compatible API
//      d. POST worker /api/admin/render-complete with the R2 key
//   3. Trigger publisher via worker /api/admin/trigger?job=publisher
//      → worker publishes via Pinterest API (it has the tokens)

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildTemplateTree } from './templates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config from environment ──────────────────────────────────────────────────

const WORKER_URL = mustEnv('WORKER_URL');                  // https://bestpicks-pinterest-agent.<acct>.workers.dev
const ADMIN_SECRET = mustEnv('ADMIN_SECRET');              // same as worker's
const R2_ACCOUNT_ID = mustEnv('R2_ACCOUNT_ID');            // from CF dashboard
const R2_ACCESS_KEY_ID = mustEnv('R2_ACCESS_KEY_ID');      // R2 API token (S3-compatible)
const R2_SECRET_ACCESS_KEY = mustEnv('R2_SECRET_ACCESS_KEY');
const R2_BUCKET = process.env.R2_BUCKET || 'bestpicks-pinterest-images';

function mustEnv(k) {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
  return v;
}

// ── Fonts (TTF, embedded once per runner invocation) ────────────────────────

async function loadFonts() {
  const dir = join(__dirname, 'fonts');
  return [
    { name: 'BebasNeue',       data: await readFile(join(dir, 'BebasNeue-400.ttf')),         weight: 400, style: 'normal' },
    { name: 'Barlow',          data: await readFile(join(dir, 'Barlow-400.ttf')),            weight: 400, style: 'normal' },
    { name: 'Barlow',          data: await readFile(join(dir, 'Barlow-700.ttf')),            weight: 700, style: 'normal' },
    { name: 'BarlowCondensed', data: await readFile(join(dir, 'BarlowCondensed-700.ttf')),   weight: 700, style: 'normal' },
  ];
}

// ── S3 client for R2 ────────────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[runner] starting');

  // 1. Pull pending renders from the worker
  const queueRes = await fetch(`${WORKER_URL}/api/admin/render-queue?limit=5`, {
    headers: { 'x-admin-secret': ADMIN_SECRET },
  });
  if (!queueRes.ok) throw new Error(`render-queue ${queueRes.status}: ${await queueRes.text()}`);
  const { entries } = await queueRes.json();
  console.log(`[runner] ${entries.length} pin(s) to render`);

  if (entries.length === 0) {
    console.log('[runner] nothing to do');
    return;
  }

  const fonts = await loadFonts();
  let ok = 0, fail = 0;

  for (const e of entries) {
    try {
      console.log(`[runner] rendering ${e.pinId} (${e.templateId})`);

      // 2a. Build template tree (returns plain JS objects, no JSX)
      const node = buildTemplateTree(e.renderRequest);

      // 2b. Satori → SVG
      const svg = await satori(node, { width: 1000, height: 1500, fonts });

      // 2c. resvg → PNG
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1000 } }).render().asPng();
      console.log(`[runner]   rendered ${png.length} bytes`);

      // 2d. Upload to R2
      const ts = new Date();
      const r2Key = `pins/${ts.getUTCFullYear()}/${String(ts.getUTCMonth() + 1).padStart(2, '0')}/${e.pinId}.png`;
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
        Body: png,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          pinId: e.pinId,
          templateId: e.templateId,
          sourceId: e.sourceId,
          generatedAt: String(Date.now()),
        },
      }));
      console.log(`[runner]   uploaded to r2://${R2_BUCKET}/${r2Key}`);

      // 2e. Notify worker
      const completeRes = await fetch(`${WORKER_URL}/api/admin/render-complete`, {
        method: 'POST',
        headers: { 'x-admin-secret': ADMIN_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinId: e.pinId, r2Key }),
      });
      if (!completeRes.ok) throw new Error(`render-complete ${completeRes.status}: ${await completeRes.text()}`);
      console.log(`[runner]   worker notified`);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[runner] FAILED ${e.pinId}:`, err.message ?? err);
    }
  }

  // 3. Trigger publisher to push the now-rendered pins through Pinterest
  console.log(`[runner] firing publisher (rendered: ${ok}, failed: ${fail})`);
  const pubRes = await fetch(`${WORKER_URL}/api/admin/trigger?job=publisher`, {
    method: 'POST',
    headers: { 'x-admin-secret': ADMIN_SECRET },
  });
  console.log(`[runner] publisher trigger: HTTP ${pubRes.status}`);

  console.log(`[runner] done. rendered: ${ok}, failed: ${fail}`);
  if (fail > 0 && ok === 0) process.exit(1);
}

main().catch(err => {
  console.error('[runner] fatal:', err);
  process.exit(1);
});
