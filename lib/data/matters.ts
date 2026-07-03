import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbMatter } from '@/lib/supabase/types';

export async function listMatters(userId: string): Promise<DbMatter[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('matters')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as DbMatter[]) ?? [];
}

export async function createMatter(
  userId: string,
  input: Partial<Omit<DbMatter, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { title: string },
): Promise<DbMatter> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('matters')
    .insert({ user_id: userId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbMatter;
}

export async function getMatter(userId: string, matterId: string): Promise<DbMatter | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('matters')
    .select('*')
    .eq('id', matterId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbMatter) ?? null;
}

/** Everything filed under a matter — drafts, signatures, review sessions (plan: matter folder). */
export async function matterFolder(userId: string, matterId: string) {
  const sb = createSupabaseAdmin();
  const [drafts, esign, reviews] = await Promise.all([
    sb.from('drafts').select('id, title, doc_type, status, language, created_at')
      .eq('user_id', userId).eq('matter_id', matterId).order('created_at', { ascending: false }),
    sb.from('esign_requests').select('id, document_name, method, status, signed_at, created_at')
      .eq('user_id', userId).eq('matter_id', matterId).order('created_at', { ascending: false }),
    sb.from('review_sessions').select('id, filename, summary, created_at')
      .eq('user_id', userId).eq('matter_id', matterId).order('created_at', { ascending: false }),
  ]);
  if (drafts.error) throw drafts.error;
  if (esign.error) throw esign.error;
  if (reviews.error) throw reviews.error;
  return {
    drafts: drafts.data ?? [],
    esignRequests: esign.data ?? [],
    reviewSessions: reviews.data ?? [],
  };
}

export interface MatterStats {
  total: number;
  active: number;
  pendingSignatures: number;
}

export async function matterStats(userId: string): Promise<MatterStats> {
  const matters = await listMatters(userId);
  return {
    total: matters.length,
    active: matters.filter((m) => m.status !== 'completed').length,
    pendingSignatures: matters.filter((m) => m.status === 'sign_pending').length,
  };
}
