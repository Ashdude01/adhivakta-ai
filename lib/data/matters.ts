import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type { DbMatter, MatterFull, MatterPartyWithContact } from '@/lib/supabase/types';
import { resolveContacts, type ContactInput } from '@/lib/data/contacts';
import { isUuid } from '@/lib/validation/uuid';

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

export interface PartyInput {
  /** Either point at an existing contact by id, or supply the fields to create one. */
  contact: ({ id: string } & Partial<ContactInput>) | ContactInput;
  role: string;
  side: 'client' | 'opposite' | 'other';
  party_no?: number;
  advocate_name?: string;
  address_for_service?: string;
}

export type MatterColumns = Partial<Omit<DbMatter, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'parties' | 'key_dates'>>;

export type MatterInput = MatterColumns & {
  title: string;
  parties?: PartyInput[];
};

/**
 * Create a matter and its parties.
 *
 * Supabase's REST client has no multi-statement transaction, so this inserts
 * the matter first and deletes it again if the parties fail to attach. A matter
 * with half its cause title is worse than no matter at all — every downstream
 * draft would silently omit a respondent.
 */
export async function createMatter(userId: string, input: MatterInput): Promise<DbMatter> {
  const { parties = [], ...columns } = input;
  const sb = createSupabaseAdmin();

  const { data, error } = await sb
    .from('matters')
    .insert({ user_id: userId, ...columns })
    .select('*')
    .single();
  if (error) throw error;
  const matter = data as DbMatter;

  if (parties.length === 0) return matter;

  try {
    await attachParties(userId, matter.id, parties);
  } catch (err) {
    await sb.from('matters').delete().eq('id', matter.id).eq('user_id', userId);
    throw err;
  }
  return matter;
}

export async function updateMatter(userId: string, matterId: string, columns: MatterColumns): Promise<DbMatter> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('matters').update(columns)
    .eq('id', matterId).eq('user_id', userId)
    .select('*').single();
  if (error) throw error;
  return data as DbMatter;
}

/** Create/link the contacts and file them under the matter with their roles. */
export async function attachParties(userId: string, matterId: string, parties: PartyInput[]): Promise<void> {
  const contactIds = await resolveContacts(
    userId,
    parties.map((p) => ('id' in p.contact
      ? { contact_id: p.contact.id, ...p.contact }
      : p.contact)),
  );

  // party_no orders the cause title ("Respondent No. 2"). Number per side when
  // the caller has not been explicit.
  const seen: Record<string, number> = {};
  const rows = parties.map((p, i) => {
    seen[p.side] = (seen[p.side] ?? 0) + 1;
    return {
      matter_id: matterId,
      contact_id: contactIds[i],
      role: p.role,
      side: p.side,
      party_no: p.party_no ?? seen[p.side],
      advocate_name: p.advocate_name ?? null,
      address_for_service: p.address_for_service ?? null,
    };
  });

  const sb = createSupabaseAdmin();
  const { error } = await sb.from('matter_parties').insert(rows);
  if (error) throw error;
}

export async function getMatter(userId: string, matterId: string): Promise<DbMatter | null> {
  if (!isUuid(matterId)) return null;
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

/** A matter with every party resolved to its contact row. */
export async function getMatterFull(userId: string, matterId: string): Promise<MatterFull | null> {
  const matter = await getMatter(userId, matterId);
  if (!matter) return null;
  return { ...matter, parties_list: await listMatterParties(matterId) };
}

export async function listMatterParties(matterId: string): Promise<MatterPartyWithContact[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('matter_parties')
    .select('*, contact:contacts(*)')
    .eq('matter_id', matterId)
    .order('side', { ascending: true })
    .order('party_no', { ascending: true });
  if (error) throw error;
  return (data as unknown as MatterPartyWithContact[]) ?? [];
}

export async function removeParty(userId: string, matterId: string, partyId: string): Promise<void> {
  const matter = await getMatter(userId, matterId);
  if (!matter) throw new Error('Matter not found');
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('matter_parties').delete().eq('id', partyId).eq('matter_id', matterId);
  if (error) throw error;
}

/** What a delete would take with it, so the advocate is warned before, not after. */
export interface MatterFootprint {
  drafts: number;
  esignRequests: number;
  reviewSessions: number;
  documents: number;
  parties: number;
}

export async function matterFootprint(userId: string, matterId: string): Promise<MatterFootprint> {
  const sb = createSupabaseAdmin();
  const count = async (table: string, column = 'matter_id') => {
    const { count: n } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(column, matterId);
    return n ?? 0;
  };
  const [drafts, esignRequests, reviewSessions, documents, parties] = await Promise.all([
    count('drafts'), count('esign_requests'), count('review_sessions'),
    count('matter_documents'), count('matter_parties'),
  ]);
  return { drafts, esignRequests, reviewSessions, documents, parties };
}

/**
 * Deletes a matter.
 *
 * `matter_parties` and `matter_documents` cascade. Drafts, e-sign requests and
 * review sessions do NOT: their `matter_id` is `on delete set null`, so a
 * signed document and its audit trail survive the folder being closed. Storage
 * objects are removed explicitly, because nothing cascades into a bucket.
 */
export async function deleteMatter(userId: string, matterId: string): Promise<void> {
  const matter = await getMatter(userId, matterId);
  if (!matter) throw new Error('Matter not found');

  const sb = createSupabaseAdmin();
  const { data: docs } = await sb
    .from('matter_documents').select('storage_path').eq('matter_id', matterId).eq('user_id', userId);

  const paths = (docs ?? []).map((d) => (d as { storage_path: string }).storage_path);
  if (paths.length) {
    const bucket = process.env.SUPABASE_BUCKET || 'adhikarik_bucket';
    await sb.storage.from(bucket).remove(paths);
  }

  const { error } = await sb.from('matters').delete().eq('id', matterId).eq('user_id', userId);
  if (error) throw error;
}

/** Everything filed under a matter — drafts, signatures, review sessions. */
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
