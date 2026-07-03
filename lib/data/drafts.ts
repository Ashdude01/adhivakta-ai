import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbDraft, DbDraftVersion, VerifierReport } from '@/lib/supabase/types';

export async function listDrafts(userId: string, limit = 20): Promise<DbDraft[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('drafts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DbDraft[]) ?? [];
}

export async function countDrafts(userId: string): Promise<number> {
  const sb = createSupabaseAdmin();
  const { count, error } = await sb
    .from('drafts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

export async function createDraft(
  userId: string,
  input: {
    docType?: string;
    title?: string;
    body?: string;
    language?: string;
    provider?: string;
    matterId?: string | null;
    templateId?: string | null;
    intake?: Record<string, unknown> | null;
    meta?: Record<string, unknown>;
  },
): Promise<DbDraft> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('drafts')
    .insert({
      user_id: userId,
      doc_type: input.docType ?? null,
      title: input.title ?? input.docType ?? 'Untitled draft',
      body: input.body ?? null,
      language: input.language ?? 'English',
      provider: input.provider ?? null,
      matter_id: input.matterId ?? null,
      template_id: input.templateId ?? null,
      intake: input.intake ?? null,
      meta: input.meta ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbDraft;
}

export async function getDraft(userId: string, draftId: string): Promise<DbDraft | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('drafts')
    .select('*')
    .eq('id', draftId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbDraft) ?? null;
}

export async function updateDraftStatus(userId: string, draftId: string, status: string): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('drafts')
    .update({ status })
    .eq('id', draftId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Append a new version (auto-numbered) with the verifier verdict, and sync drafts.body. */
export async function addDraftVersion(
  draftId: string,
  input: {
    content: string;
    source?: 'ai' | 'human' | 'ai-command';
    provider?: string | null;
    verifierReport?: VerifierReport | null;
  },
): Promise<DbDraftVersion> {
  const sb = createSupabaseAdmin();
  const { data: last } = await sb
    .from('draft_versions')
    .select('version_no')
    .eq('draft_id', draftId)
    .order('version_no', { ascending: false })
    .limit(1);
  const versionNo = ((last?.[0]?.version_no as number) ?? 0) + 1;

  const { data, error } = await sb
    .from('draft_versions')
    .insert({
      draft_id: draftId,
      version_no: versionNo,
      content: input.content,
      source: input.source ?? 'ai',
      provider: input.provider ?? null,
      verifier_report: input.verifierReport ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await sb.from('drafts').update({ body: input.content }).eq('id', draftId);
  return data as DbDraftVersion;
}

export async function listDraftVersions(draftId: string): Promise<DbDraftVersion[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('draft_versions')
    .select('*')
    .eq('draft_id', draftId)
    .order('version_no', { ascending: false });
  if (error) throw error;
  return (data as DbDraftVersion[]) ?? [];
}

/** Persist claim→source links for a version (plan: citations table). */
export async function saveCitations(draftVersionId: string, report: VerifierReport): Promise<void> {
  if (!report.claims.length) return;
  const sb = createSupabaseAdmin();
  const rows = report.claims.map((c) => ({
    draft_version_id: draftVersionId,
    library_item_id: c.library_item_id,
    claim_text: c.claim,
    source_kind: c.source_kind,
    verified: c.verified,
    verify_url: c.verify_url,
  }));
  const { error } = await sb.from('citations').insert(rows);
  if (error) console.error('saveCitations failed:', error.message);
}
