import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbChatMessage, DbReviewChunk, DbReviewSession } from '@/lib/supabase/types';

export async function createReviewSession(
  userId: string,
  input: { filename?: string; context?: string; matterId?: string | null },
): Promise<DbReviewSession> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('review_sessions')
    .insert({
      user_id: userId,
      filename: input.filename ?? null,
      context: input.context ?? null,
      matter_id: input.matterId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbReviewSession;
}

export async function saveSummary(sessionId: string, summary: string): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('review_sessions').update({ summary }).eq('id', sessionId);
  if (error) throw error;
}

export async function getReviewSession(userId: string, sessionId: string): Promise<DbReviewSession | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('review_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbReviewSession) ?? null;
}

/**
 * Split document text into retrieval units (~1,200 chars, paragraph-aware) and
 * index them for FTS (plan §7.1 — chunk + index; embeddings slot in later).
 */
export function chunkText(text: string, target = 1200): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > target) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text.slice(0, target)];
}

export async function saveChunks(sessionId: string, text: string): Promise<number> {
  const sb = createSupabaseAdmin();
  const chunks = chunkText(text);
  const rows = chunks.map((c, i) => ({ session_id: sessionId, seq: i + 1, text: c }));
  const { error } = await sb.from('review_chunks').insert(rows);
  if (error) throw error;
  return chunks.length;
}

/** FTS retrieval over the session's chunks; falls back to keyword scoring. */
export async function searchChunks(sessionId: string, query: string, limit = 6): Promise<DbReviewChunk[]> {
  const sb = createSupabaseAdmin();

  const { data, error } = await sb
    .from('review_chunks')
    .select('id, session_id, seq, text, created_at')
    .eq('session_id', sessionId)
    .textSearch('fts', query, { type: 'websearch', config: 'english' })
    .limit(limit);
  if (!error && data && data.length > 0) return data as DbReviewChunk[];

  // fallback: keyword overlap in application code (short docs, odd queries)
  const { data: all, error: allErr } = await sb
    .from('review_chunks')
    .select('id, session_id, seq, text, created_at')
    .eq('session_id', sessionId)
    .order('seq');
  if (allErr) throw allErr;
  const stop = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'and', 'what', 'this', 'that', 'for', 'on']);
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
  return ((all as DbReviewChunk[]) ?? [])
    .map((c) => ({ c, score: words.reduce((acc, w) => acc + (c.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.c);
}

export async function addChatMessage(
  sessionId: string,
  role: 'user' | 'ai',
  content: string,
  citations?: Array<{ seq: number; quote?: string }>,
): Promise<DbChatMessage> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content, citations: citations ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbChatMessage;
}

export async function listChatMessages(sessionId: string): Promise<DbChatMessage[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');
  if (error) throw error;
  return (data as DbChatMessage[]) ?? [];
}
