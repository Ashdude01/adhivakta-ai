// Bulk-backfill the Case & Draft Library from the free, public AWS Open Data
// judgment datasets maintained by Dattam Labs (CC-BY-4.0):
//   - s3://indian-supreme-court-judgments  (52 GB,  ~35k judgments, 1950–2025)
//   - s3://indian-high-court-judgments     (1.25 TiB, 17.8M PDFs, 25 courts)
//
// Both buckets are PUBLIC (anonymous GetObject/ListBucket) — no AWS account
// or credentials needed. We talk to them with plain HTTPS (Node's built-in
// fetch), not the AWS SDK, to avoid adding a dependency for something this
// simple. PDFs go to Supabase Storage; extracted text + metadata go to
// Postgres (library_items + library_item_blocks).
//
// Scope for this run (deliberately small — this is a priced, time-bound
// operation, not something to fire-and-forget at full dataset size):
//   --source=sc         Supreme Court, English judgments only
//   --source=delhi      Delhi High Court   (court code 7_26)
//   --source=allahabad  Allahabad High Court / UP (court code 9_13)
//   --source=all        all three (default)
//   --years=3           how many most-recent years to pull (default 3)
//   --limit=200          max documents per source per run (default 200 —
//                         raise it once a --dry-run looks right)
//   --dry-run            list what WOULD be pulled, download nothing,
//                         write nothing. Always run this first.
//   --force              re-process items that already have blocks
//
// Usage:
//   node scripts/ingest-library.mjs --dry-run --source=sc --years=3
//   node scripts/ingest-library.mjs --source=sc --years=3 --limit=50
//   node scripts/ingest-library.mjs --source=delhi --years=3 --limit=50
//   node scripts/ingest-library.mjs --source=allahabad --years=3 --limit=50
//
// IMPORTANT — the High Court dataset's exact S3 key layout for a specific
// court+year (court-then-year vs year-then-court) was not independently
// confirmed before writing this script (the one verified example in the
// project's docs was `data/tar/.../court=27_1/...`, bulk tar archives, not
// the per-file `data/pdf/` layout this script uses for a small selective
// pull). The discoverHcLayout() step below PROBES both orderings against
// the live bucket and tells you in the console which one worked — read that
// output before trusting a real (non---dry-run) run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ---- CLI args ---------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const DRY_RUN = !!args['dry-run'];
const FORCE = !!args.force;
const YEARS_BACK = Number(args.years || 3);
const LIMIT_PER_SOURCE = Number(args.limit || 200);
const WANTED_SOURCES =
  args.source && args.source !== 'all' ? [String(args.source)] : ['sc', 'delhi', 'allahabad'];

// ---- .env.local (same loader as scripts/db-apply.mjs, no extra deps) -------
function loadEnv() {
  const env = {};
  let raw = '';
  try {
    raw = readFileSync(join(root, '.env.local'), 'utf8');
  } catch {
    raw = '';
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    let value = t.slice(i + 1).trim();
    // Strip matching surrounding quotes — KEY="value" / KEY='value' are both
    // common in .env files and shouldn't end up inside the actual string.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = value;
  }
  return { ...env, ...process.env };
}
const env = loadEnv();

function supabaseAdmin() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.supabase_project_url;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.secret_key;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const STORAGE_BUCKET = 'library-pdfs';
const currentYear = new Date().getFullYear();
const targetYears = Array.from({ length: YEARS_BACK }, (_, i) => currentYear - i);

// ---- tiny S3 (public, unsigned) REST client ---------------------------------
const REGION = 'ap-south-1';

function s3BaseUrl(bucket) {
  return `https://${bucket}.s3.${REGION}.amazonaws.com`;
}

/**
 * fetch() with retries + a longer per-attempt timeout. Plain network blips
 * (slow wifi, a dropped connection to AWS) are common and shouldn't kill an
 * hours-long ingestion run over one file.
 */
async function fetchWithRetry(url, { attempts = 4, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (i < attempts) {
        const waitMs = 1000 * 2 ** (i - 1); // 1s, 2s, 4s, ...
        console.warn(`  (network hiccup, retry ${i}/${attempts - 1} in ${waitMs}ms: ${err.message})`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

function xmlUnescape(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** One page of ListObjectsV2 against a public bucket. No signing needed. */
async function s3List(bucket, { prefix = '', delimiter, continuationToken } = {}) {
  const u = new URL(s3BaseUrl(bucket) + '/');
  u.searchParams.set('list-type', '2');
  if (prefix) u.searchParams.set('prefix', prefix);
  if (delimiter) u.searchParams.set('delimiter', delimiter);
  if (continuationToken) u.searchParams.set('continuation-token', continuationToken);
  const res = await fetchWithRetry(u.toString());
  if (!res.ok) throw new Error(`S3 list failed (${res.status}) for ${u}`);
  const xml = await res.text();

  const keys = [...xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<\/Contents>/g)].map(
    (m) => xmlUnescape(m[1]),
  );
  const commonPrefixes = [...xml.matchAll(/<CommonPrefixes><Prefix>([^<]+)<\/Prefix><\/CommonPrefixes>/g)].map(
    (m) => xmlUnescape(m[1]),
  );
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
  return { keys, commonPrefixes, isTruncated, nextToken: tokenMatch ? tokenMatch[1] : null };
}

/** List every object under a prefix (follows pagination). Use with care on big prefixes. */
async function s3ListAll(bucket, prefix, { delimiter, hardCap = 5000 } = {}) {
  let keys = [];
  let commonPrefixes = [];
  let token;
  do {
    const page = await s3List(bucket, { prefix, delimiter, continuationToken: token });
    keys = keys.concat(page.keys);
    commonPrefixes = commonPrefixes.concat(page.commonPrefixes);
    token = page.nextToken;
    if (keys.length >= hardCap) break;
  } while (token);
  return { keys, commonPrefixes: [...new Set(commonPrefixes)] };
}

async function s3GetBuffer(bucket, key) {
  const res = await fetchWithRetry(`${s3BaseUrl(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`);
  if (!res.ok) throw new Error(`S3 get failed (${res.status}) for ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

async function s3GetJsonOrNull(bucket, key) {
  try {
    const res = await fetchWithRetry(`${s3BaseUrl(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`, {
      attempts: 2, // metadata sidecar is optional — don't burn time retrying hard for it
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- text -> paragraph blocks -----------------------------------------------
function toBlocks(text) {
  const paras = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
  if (paras.length > 3) return paras;
  // Fallback for text with no blank-line structure (common in OCR'd PDFs):
  // fixed-size chunks so the UI still has stable, reasonably sized blocks.
  const flat = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let i = 0; i < flat.length; i += 1000) chunks.push(flat.slice(i, i + 1000));
  return chunks;
}

// ---- per-source config -------------------------------------------------------
const SOURCES = {
  sc: {
    bucket: 'indian-supreme-court-judgments',
    label: 'Supreme Court',
    courtName: 'Supreme Court',
    sourceDataset: 'sc-aws-dattam',
    // Confirmed layout: data/pdf/year=<Y>/english/<file>.pdf
    listPdfKeys: async (year, limit) => {
      const { keys } = await s3ListAll(
        'indian-supreme-court-judgments',
        `data/pdf/year=${year}/english/`,
        { hardCap: limit },
      );
      return keys.slice(0, limit);
    },
    metadataKeyFor: (pdfKey) => pdfKey.replace('data/pdf/', 'metadata/json/').replace(/\.pdf$/, '.json'),
    slugFor: (pdfKey) => `sc-${pdfKey.split('/').pop().replace(/\.pdf$/, '')}`,
  },
  delhi: {
    bucket: 'indian-high-court-judgments',
    label: 'Delhi High Court',
    courtName: 'Delhi High Court',
    sourceDataset: 'hc-aws-dattam',
    courtCode: '7_26',
    listPdfKeys: hcListPdfKeysFactory('7_26'),
    metadataKeyFor: (pdfKey) => pdfKey.replace('data/pdf/', 'metadata/json/').replace(/\.pdf$/, '.json'),
    slugFor: (pdfKey) => `hc-delhi-${pdfKey.split('/').pop().replace(/\.pdf$/, '')}`,
  },
  allahabad: {
    bucket: 'indian-high-court-judgments',
    label: 'Allahabad High Court',
    courtName: 'Allahabad High Court',
    sourceDataset: 'hc-aws-dattam',
    courtCode: '9_13',
    listPdfKeys: hcListPdfKeysFactory('9_13'),
    metadataKeyFor: (pdfKey) => pdfKey.replace('data/pdf/', 'metadata/json/').replace(/\.pdf$/, '.json'),
    slugFor: (pdfKey) => `hc-allahabad-${pdfKey.split('/').pop().replace(/\.pdf$/, '')}`,
  },
};

/**
 * The HC dataset's per-file layout under a specific court+year was not
 * independently verified. We probe both plausible orderings the first time
 * and remember whichever one actually returns keys.
 */
function hcListPdfKeysFactory(courtCode) {
  let resolvedTemplate = null; // 'year-then-court' | 'court-then-year'
  return async (year, limit) => {
    const bucket = 'indian-high-court-judgments';
    const candidates = resolvedTemplate
      ? [resolvedTemplate]
      : ['year-then-court', 'court-then-year'];
    for (const template of candidates) {
      const prefix =
        template === 'year-then-court'
          ? `data/pdf/year=${year}/court=${courtCode}/`
          : `data/pdf/court=${courtCode}/year=${year}/`;
      const { keys } = await s3ListAll(bucket, prefix, { hardCap: limit });
      if (keys.length > 0) {
        if (!resolvedTemplate) {
          resolvedTemplate = template;
          console.log(`  (discovered HC layout: ${template}, prefix style "${prefix}")`);
        }
        return keys.slice(0, limit);
      }
    }
    console.warn(
      `  ! no PDFs found for court=${courtCode} year=${year} under either layout guess — ` +
        `the real key structure differs from what this script assumes. Run with --dry-run ` +
        `and inspect s3ListAll('${bucket}', 'data/pdf/') by hand to find the real prefix, ` +
        `then adjust hcListPdfKeysFactory().`,
    );
    return [];
  };
}

// ---- metadata best-effort extraction -----------------------------------------
function pickMetadata(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const get = (...keys) => {
    for (const k of keys) if (raw[k] != null && raw[k] !== '') return raw[k];
    return undefined;
  };
  return {
    title: get('title', 'case_title', 'caseTitle', 'case_name'),
    citation: get('citation', 'neutral_citation', 'neutralCitation'),
    cnr: get('cnr', 'CNR'),
    decisionDate: get('decision_date', 'date_of_decision', 'decisionDate'),
    bench: get('bench', 'judge', 'judges'),
  };
}

// ---- main per-item pipeline ---------------------------------------------------
async function processOne(sb, source, pdfKey, year) {
  const slug = source.slugFor(pdfKey);

  if (!FORCE) {
    const { data: existing } = await sb.from('library_items').select('id').eq('slug', slug).maybeSingle();
    if (existing) {
      console.log(`  • ${slug} already ingested, skipping (use --force to redo)`);
      return 'skipped';
    }
  }

  console.log(`  ↓ ${pdfKey}`);
  const pdfBuf = await s3GetBuffer(source.bucket, pdfKey);

  let text = '';
  try {
    const parsed = await pdfParse(pdfBuf);
    text = parsed.text || '';
  } catch (err) {
    console.warn(`  ! pdf-parse failed for ${pdfKey}: ${err.message}`);
  }
  if (!text.trim()) {
    console.warn(`  ! no extractable text for ${pdfKey} (likely a scanned/image PDF) — skipping`);
    return 'no-text';
  }

  const metaRaw = await s3GetJsonOrNull(source.bucket, source.metadataKeyFor(pdfKey));
  const meta = pickMetadata(metaRaw);
  const title = meta.title || `${source.courtName} judgment ${year} — ${pdfKey.split('/').pop()}`;

  if (DRY_RUN) {
    console.log(`  (dry-run) would insert slug=${slug} title="${title}" chars=${text.length}`);
    if (metaRaw) console.log(`  (dry-run) metadata.json shape: ${JSON.stringify(metaRaw).slice(0, 300)}`);
    return 'dry-run';
  }

  const storagePath = `${source.sourceDataset}/${year}/${pdfKey.split('/').pop()}`;
  const { error: uploadErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pdfBuf, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) console.warn(`  ! storage upload failed for ${slug}: ${uploadErr.message}`);

  const { data: itemRow, error: upsertErr } = await sb
    .from('library_items')
    .upsert(
      {
        slug,
        kind: 'judgment',
        title,
        court: source.courtName,
        citation: meta.citation ?? null,
        cnr: meta.cnr ?? null,
        year,
        source_dataset: source.sourceDataset,
        source_url: `${s3BaseUrl(source.bucket)}/${pdfKey}`,
        excerpt: text.slice(0, 400).replace(/\s+/g, ' ').trim(),
        full_text: text,
        verified: false,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();
  if (upsertErr) {
    console.error(`  ! upsert failed for ${slug}: ${upsertErr.message}`);
    return 'error';
  }

  const blocks = toBlocks(text);
  await sb.from('library_item_blocks').delete().eq('library_item_id', itemRow.id);
  const rows = blocks.map((b, i) => ({ library_item_id: itemRow.id, seq: i, text: b }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: blockErr } = await sb.from('library_item_blocks').insert(rows.slice(i, i + 500));
    if (blockErr) console.warn(`  ! block insert failed for ${slug}: ${blockErr.message}`);
  }

  console.log(`  ✓ ${slug} — ${blocks.length} blocks, ${text.length} chars`);
  return 'ingested';
}

async function ensureBucket(sb) {
  if (DRY_RUN) return;
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === STORAGE_BUCKET)) {
    const { error } = await sb.storage.createBucket(STORAGE_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
    console.log(`✓ created storage bucket "${STORAGE_BUCKET}"`);
  }
}

async function main() {
  console.log(`Target years: ${targetYears.join(', ')}`);
  console.log(`Sources: ${WANTED_SOURCES.join(', ')}`);
  console.log(`Limit per source: ${LIMIT_PER_SOURCE}${DRY_RUN ? '  [DRY RUN — no writes]' : ''}\n`);

  // Always create the client, even in --dry-run: the duplicate-slug check
  // below is a read and is useful to see in a dry run too. Only the actual
  // writes (storage upload, upsert, block insert) are skipped under DRY_RUN —
  // see the early return inside processOne().
  const sb = supabaseAdmin();
  await ensureBucket(sb);

  const tally = {};
  for (const key of WANTED_SOURCES) {
    const source = SOURCES[key];
    if (!source) {
      console.warn(`Unknown source "${key}", skipping`);
      continue;
    }
    console.log(`\n=== ${source.label} ===`);
    let remaining = LIMIT_PER_SOURCE;
    for (const year of targetYears) {
      if (remaining <= 0) break;
      console.log(` year ${year}`);
      let pdfKeys;
      try {
        pdfKeys = await source.listPdfKeys(year, remaining);
      } catch (err) {
        console.error(`  ! could not list ${source.label} ${year} (network issue): ${err.message}`);
        console.error(`    skipping this year, continuing with the rest`);
        tally.error = (tally.error || 0) + 1;
        continue;
      }
      if (pdfKeys.length === 0) {
        console.log(`  (no documents found for ${year})`);
        continue;
      }
      for (const pdfKey of pdfKeys) {
        if (remaining <= 0) break;
        try {
          const result = await processOne(sb, source, pdfKey, year);
          tally[result] = (tally[result] || 0) + 1;
        } catch (err) {
          console.error(`  ! failed on ${pdfKey}: ${err.message}`);
          tally.error = (tally.error || 0) + 1;
        }
        remaining -= 1;
        await new Promise((r) => setTimeout(r, 150)); // be a polite anonymous client
      }
    }
  }

  console.log('\n--- summary ---');
  for (const [k, v] of Object.entries(tally)) console.log(`${k}: ${v}`);
  if (DRY_RUN) console.log('\nThis was a dry run — nothing was written. Re-run without --dry-run to ingest.');
}

main().catch((err) => {
  console.error('\nIngestion failed:', err);
  process.exit(1);
});
