import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbContribution, DbLibraryItem } from '@/lib/supabase/types';
import type { LibItem } from './cases';
import type { PiiFinding } from '@/lib/legal/anonymiser';

function toLibItem(r: DbLibraryItem): LibItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    court: r.court ?? '',
    citation: r.citation ?? undefined,
    tags: r.tags ?? [],
    author: r.author ?? undefined,
    outcome: r.outcome ?? undefined,
    excerpt: r.excerpt ?? '',
    uses: r.uses ?? undefined,
    cited: r.cited ?? undefined,
    verified: r.verified,
    sourceUrl: r.source_url ?? undefined,
  };
}

export async function listLibrary(): Promise<LibItem[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as DbLibraryItem[]) ?? []).map(toLibItem);
}

export async function contributeDraft(
  userId: string,
  input: { title: string; court?: string; tags?: string[]; outcome?: string; excerpt?: string; fullText?: string },
): Promise<LibItem> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_items')
    .insert({
      kind: 'draft',
      title: input.title,
      court: input.court ?? null,
      tags: input.tags ?? [],
      outcome: input.outcome ?? null,
      excerpt: input.excerpt ?? null,
      full_text: input.fullText ?? null,
      verified: false,
      contributed_by: userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toLibItem(data as DbLibraryItem);
}

/**
 * Contribution pipeline (plan §6.3): store the raw + anonymised text and the
 * PII report; an automated moderation gate (duplicate + residual-PII checks in
 * the API layer) decides whether it publishes immediately or waits for review.
 */
export async function createContribution(
  userId: string,
  input: {
    title: string;
    rawText: string;
    anonymisedText: string;
    piiReport: PiiFinding[];
    court?: string;
    tags?: string[];
    outcome?: string;
    status: 'pending' | 'approved';
  },
): Promise<DbContribution> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('contributions')
    .insert({
      user_id: userId,
      title: input.title,
      raw_text: input.rawText,
      anonymised_text: input.anonymisedText,
      pii_report: input.piiReport,
      court: input.court ?? null,
      tags: input.tags ?? [],
      outcome: input.outcome ?? null,
      status: input.status,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbContribution;
}

export async function linkContributionToItem(contributionId: string, libraryItemId: string): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('contributions')
    .update({ library_item_id: libraryItemId })
    .eq('id', contributionId);
  if (error) throw error;
}

export async function awardCredit(userId: string, reason: string, refId?: string, delta = 1): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('credit_ledger')
    .insert({ user_id: userId, delta, reason, ref_id: refId ?? null });
  if (error) console.error('awardCredit failed:', error.message);
}

/** Near-duplicate gate: same-title (case-insensitive) draft already published. */
export async function findDuplicateDraft(title: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_items')
    .select('id')
    .eq('kind', 'draft')
    .ilike('title', title.trim())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
