import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbLibraryItem, VerifierClaim, VerifierReport } from '@/lib/supabase/types';
import { matchAct } from './statutes';

// Deterministic citation verifier (implementation plan §5.2 / §9).
// Every [[...]] claim in AI output is resolved against the statute registry or
// the library; a claim passes only if its source actually exists. No LLM trust.

const CLAIM_RE = /\[\[([^\]]+)\]\]/g;
const SECTION_RE = /(?:section|sec\.?|§|s\.)\s*(\d+[A-Za-z]?(?:\s*\(\d+\))?)/i;
const VERSUS_RE = /\b(v\.?s?\.?|versus)\b/i;

export function extractClaims(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = CLAIM_RE.exec(text)) !== null) {
    const claim = m[1].trim();
    if (claim && !out.includes(claim)) out.push(claim);
  }
  return out;
}

function verifyStatuteClaim(claim: string): VerifierClaim | null {
  const act = matchAct(claim);
  if (!act) return null;
  const sec = claim.match(SECTION_RE);
  if (!sec) {
    // Act referenced without a specific section — the Act itself is the source.
    return { claim, source_kind: 'statute', verified: true, verify_url: act.url, library_item_id: null };
  }
  const num = parseInt(sec[1], 10);
  const ok = Number.isFinite(num) && num >= 1 && num <= act.maxSection;
  return {
    claim,
    source_kind: 'statute',
    verified: ok,
    verify_url: ok ? act.url : null,
    library_item_id: null,
    note: ok ? undefined : `Section ${sec[1]} is outside the ${act.name} (1–${act.maxSection}).`,
  };
}

async function verifyJudgmentClaim(claim: string): Promise<VerifierClaim> {
  const sb = createSupabaseAdmin();

  // Try the party names before/after "v." plus any reporter citation string.
  const reporter = claim.match(/\((\d{4})\)\s*\d+\s*SCC\s*\d+|AIR\s*\d{4}\s*\w+\s*\d+/i);
  const firstParty = claim.split(VERSUS_RE)[0]?.trim().replace(/[.,]$/, '');

  let item: DbLibraryItem | null = null;

  if (reporter) {
    const { data } = await sb
      .from('library_items')
      .select('*')
      .ilike('citation', `%${reporter[0].replace(/\s+/g, ' ')}%`)
      .limit(1);
    item = (data?.[0] as DbLibraryItem) ?? null;
  }
  if (!item && firstParty && firstParty.length >= 4) {
    const { data } = await sb
      .from('library_items')
      .select('*')
      .eq('kind', 'judgment')
      .ilike('title', `%${firstParty}%`)
      .limit(1);
    item = (data?.[0] as DbLibraryItem) ?? null;
  }

  if (item) {
    return {
      claim,
      source_kind: 'judgment',
      verified: true,
      verify_url: item.source_url,
      library_item_id: item.id,
    };
  }
  return {
    claim,
    source_kind: 'judgment',
    verified: false,
    verify_url: null,
    library_item_id: null,
    note: 'No matching judgment in the library — verify manually before relying on it.',
  };
}

/**
 * Verify every [[...]] claim in a draft or chat answer.
 * Statute claims resolve against the in-repo registry; judgment claims resolve
 * against library_items. Anything unresolvable is flagged, never silently passed.
 */
export async function verifyText(text: string): Promise<VerifierReport> {
  const claims = extractClaims(text);
  const results: VerifierClaim[] = [];

  for (const claim of claims) {
    const statute = verifyStatuteClaim(claim);
    if (statute) {
      results.push(statute);
      continue;
    }
    if (VERSUS_RE.test(claim) || /SCC|AIR\s*\d{4}/i.test(claim)) {
      results.push(await verifyJudgmentClaim(claim));
      continue;
    }
    results.push({
      claim,
      source_kind: 'unknown',
      verified: false,
      verify_url: null,
      library_item_id: null,
      note: 'Not recognisable as a statute or judgment citation.',
    });
  }

  const passed = results.filter((r) => r.verified).length;
  return { checked: results.length, passed, failed: results.length - passed, claims: results };
}
