// Apply SQL migrations + seed the demo user/matters against Supabase Postgres.
// Usage: pnpm db:apply
//
// Connects over the IPv4 pooler (DATABASE_URL) and falls back to the direct
// host (DATABASE_URL_DIRECT). Reads credentials from .env.local. Idempotent.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ---- load .env.local (no extra deps) ---------------------------------------
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

async function connect() {
  const candidates = [
    ['pooler', env.DATABASE_URL],
    ['direct', env.DATABASE_URL_DIRECT],
  ].filter(([, v]) => v);

  let lastErr;
  for (const [label, connectionString] of candidates) {
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      console.log(`✓ connected via ${label}`);
      return client;
    } catch (err) {
      console.warn(`✗ ${label} connection failed: ${err.message}`);
      lastErr = err;
      try { await client.end(); } catch {}
    }
  }
  throw lastErr || new Error('No DATABASE_URL configured');
}

async function runMigrations(client) {
  const dir = join(root, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    process.stdout.write(`→ applying ${f} … `);
    await client.query(sql);
    console.log('done');
  }
  // Supabase's API layer (PostgREST) caches the table list and only learns
  // about new tables/columns when told to reload. Running DDL over a plain
  // `pg` connection (like this script does) doesn't always trigger that
  // automatically, which shows up as a confusing "Could not find the table
  // 'public.whatever' in the schema cache" (PGRST205) from the app even
  // though the table clearly exists. Ask it to reload every time, just in case.
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('✓ told PostgREST to reload its schema cache');
}

const SAMPLE_MATTERS = [
  ['138', 'Sharma vs Kapoor — Cheque Bounce', 'NI Act §138 · District Court, Jaipur', 'District Court', 'draft', 'Draft ready', 't-accent', 'var(--brand)'],
  ['MC', 'Verma Motor Accident Claim', 'MACT · Awaiting signature', 'MACT', 'sign_pending', 'Sign pending', 't-danger', 'var(--accent)'],
  ['CC', 'Mehta Consumer Complaint', 'Consumer Forum · Under review', 'Consumer Forum', 'reviewing', 'Reviewing', 't-brand', 'var(--success)'],
  ['RE', 'Gupta Rent & Eviction Notice', 'Rent Control · Completed', 'Rent Control', 'completed', 'Completed', 't-success', '#8A7FB5'],
  ['BA', 'Khan Bail Application', 'Sessions Court · Filed', 'Sessions Court', 'filed', 'Filed', 't-grey', '#5AA9C9'],
];

async function seedDemo(client) {
  const email = env.DEMO_USER_EMAIL || 'advocate@adhivakta.ai';
  const password = env.DEMO_USER_PASSWORD || 'advocate123';
  const hash = bcrypt.hashSync(password, 10);

  const { rows } = await client.query(
    `insert into public.users (email, name, password_hash, role, plan, firm_name)
     values ($1, $2, $3, 'advocate', 'pro', 'Sharma & Associates')
     on conflict (email) do update set password_hash = excluded.password_hash
     returning id`,
    [email, 'Adv. R. Sharma', hash],
  );
  const userId = rows[0].id;
  console.log(`✓ demo user ready: ${email}`);

  const { rows: cnt } = await client.query(
    'select count(*)::int as n from public.matters where user_id = $1',
    [userId],
  );
  if (cnt[0].n === 0) {
    for (const m of SAMPLE_MATTERS) {
      await client.query(
        `insert into public.matters (user_id, code, title, subtitle, court, status, tag, tag_class, color)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId, ...m],
      );
    }
    console.log(`✓ seeded ${SAMPLE_MATTERS.length} sample matters`);
  } else {
    console.log(`• matters already present (${cnt[0].n}); skipping sample seed`);
  }
}

async function main() {
  const client = await connect();
  try {
    await runMigrations(client);
    await seedDemo(client);
    const { rows } = await client.query('select count(*)::int as n from public.library_items');
    console.log(`✓ library_items rows: ${rows[0].n}`);
    console.log('\nAll migrations applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
