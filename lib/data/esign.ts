import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbEsignRequest } from '@/lib/supabase/types';
import { isUuid } from '@/lib/validation/uuid';

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

export async function getEsignRequest(userId: string, requestId: string): Promise<DbEsignRequest | null> {
  if (!isUuid(requestId)) return null;
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('esign_requests').select('*')
    .eq('id', requestId).eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as DbEsignRequest) ?? null;
}

export async function listEsignEventsFor(requestId: string) {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('esign_events').select('*')
    .eq('esign_request_id', requestId)
    .order('at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Withdraws a signature request that has not been signed.
 *
 * A signed request is never deleted: it is the evidence that a document was
 * executed, and the IT Act eligibility decision recorded against it is a
 * compliance artefact. Callers must check `status` first.
 */
export async function deleteEsignRequest(userId: string, requestId: string): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('esign_requests').delete()
    .eq('id', requestId).eq('user_id', userId).neq('status', 'signed');
  if (error) throw error;
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
