import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbEsignRequest } from '@/lib/supabase/types';

export async function listEsignRequests(userId: string, limit = 20): Promise<DbEsignRequest[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('esign_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DbEsignRequest[]) ?? [];
}

export async function createEsignRequest(
  userId: string,
  input: {
    documentName: string;
    method: string;
    status: string;
    envelopeId?: string | null;
    signers?: unknown;
    signatureUrl?: string | null;
    signedAt?: string | null;
    matterId?: string | null;
    eligibilityReport?: Record<string, unknown> | null;
  },
): Promise<DbEsignRequest> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('esign_requests')
    .insert({
      user_id: userId,
      document_name: input.documentName,
      method: input.method,
      status: input.status,
      envelope_id: input.envelopeId ?? null,
      signers: input.signers ?? null,
      signature_url: input.signatureUrl ?? null,
      signed_at: input.signedAt ?? null,
      matter_id: input.matterId ?? null,
      eligibility_report: input.eligibilityReport ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbEsignRequest;
}

/** Raw provider/system event trail per signing envelope (append-only). */
export async function addEsignEvent(
  esignRequestId: string,
  event: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb
      .from('esign_events')
      .insert({ esign_request_id: esignRequestId, event, payload: payload ?? null });
    if (error) throw error;
  } catch (err) {
    console.error('addEsignEvent failed:', (err as Error).message);
  }
}
