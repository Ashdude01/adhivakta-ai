import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import type {
  DbContribution, DbLibraryItem, DbLibraryItemBlock,
  DbHighlight, DbHighlightNote, DbHighlightLink, HighlightDTO, HighlightLinkType,
} from '@/lib/supabase/types';
import type { LibItem } from './cases';
import type { PiiFinding } from '@/lib/legal/anonymiser';

function toLibItem(r: DbLibraryItem): LibItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    court: r.court ?? '',
    citation: r.citation ?? undefined,
    year: r.year ?? undefined,
    cnr: r.cnr ?? undefined,
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

/** Unfiltered initial load for the server-rendered page (kept small — see searchLibrary for the live search/filter API). */
export async function listLibrary(): Promise<LibItem[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data as DbLibraryItem[]) ?? []).map(toLibItem);
}

export type LibrarySort = 'recent' | 'cited' | 'year';

export interface LibrarySearchQuery {
  /** Free-text search over title/citation/excerpt/full_text (uses the library_items.fts index). */
  q?: string;
  kind?: 'judgment' | 'draft';
  /** Partial, case-insensitive match against court, e.g. "Supreme Court" / "Delhi" / "Allahabad". */
  court?: string;
  /** Excludes an exact court match — used for the "High Courts" chip (judgments minus Supreme Court). */
  excludeCourt?: string;
  /** Exact-match multi-select against the canonical court vocabulary (lib/data/indianCourts.ts). */
  courts?: string[];
  /** Inclusive year-decided range. */
  yearFrom?: number;
  yearTo?: number;
  tag?: string;
  sort?: LibrarySort;
  limit?: number;
  offset?: number;
}

export interface LibrarySearchResult {
  items: LibItem[];
  total: number;
}

/** Server-side search + filter, backing GET /api/library. Scales to the full ingested corpus (no client-side full-table filtering). */
export async function searchLibrary(query: LibrarySearchQuery = {}): Promise<LibrarySearchResult> {
  const sb = createSupabaseAdmin();
  const limit = Math.min(Math.max(query.limit ?? 24, 1), 60);
  const offset = Math.max(query.offset ?? 0, 0);

  let qb = sb.from('library_items').select('*', { count: 'exact' });
  if (query.kind) qb = qb.eq('kind', query.kind);
  if (query.court) qb = qb.ilike('court', `%${query.court}%`);
  if (query.excludeCourt) qb = qb.neq('court', query.excludeCourt);
  if (query.courts && query.courts.length > 0) qb = qb.in('court', query.courts);
  if (typeof query.yearFrom === 'number') qb = qb.gte('year', query.yearFrom);
  if (typeof query.yearTo === 'number') qb = qb.lte('year', query.yearTo);
  if (query.tag) qb = qb.contains('tags', [query.tag]);
  if (query.q && query.q.trim()) {
    qb = qb.textSearch('fts', query.q.trim(), { type: 'websearch', config: 'english' });
  }
  if (query.sort === 'cited') qb = qb.order('cited', { ascending: false });
  else if (query.sort === 'year') qb = qb.order('year', { ascending: false, nullsFirst: false });
  else qb = qb.order('created_at', { ascending: false });
  qb = qb.range(offset, offset + limit - 1);

  const { data, error, count } = await qb;
  if (error) throw error;
  return { items: ((data as DbLibraryItem[]) ?? []).map(toLibItem), total: count ?? 0 };
}

/** Full row for the judgment/draft detail page — includes full_text, source_url, cnr etc. that LibItem doesn't carry. */
export async function getLibraryItem(id: string): Promise<DbLibraryItem | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('library_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as DbLibraryItem) ?? null;
}

/** Paragraph/chunk blocks for a judgment, in reading order — what highlights anchor to. */
export async function listLibraryItemBlocks(libraryItemId: string): Promise<DbLibraryItemBlock[]> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_item_blocks')
    .select('*')
    .eq('library_item_id', libraryItemId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return (data as DbLibraryItemBlock[]) ?? [];
}

/**
 * Where to download this judgment's PDF from. The ingestion script mirrors every
 * PDF into our own private Supabase Storage bucket ("library-pdfs"), reconstructed
 * here from source_dataset + year + the filename in source_url. If that object is
 * missing (e.g. the upload step warned-and-continued during ingestion) we fall back
 * to source_url itself — the original dataset's bucket is public, anonymous-read.
 */
export async function getLibraryItemPdfUrl(item: DbLibraryItem): Promise<{ url: string; isMirror: boolean } | null> {
  if (!item.source_url) return null;
  if (item.source_dataset && item.year) {
    try {
      const filename = decodeURIComponent(new URL(item.source_url).pathname.split('/').pop() || '');
      if (filename) {
        const storagePath = `${item.source_dataset}/${item.year}/${filename}`;
        const sb = createSupabaseAdmin();
        const { data, error } = await sb.storage.from('library-pdfs').createSignedUrl(storagePath, 3600);
        if (!error && data?.signedUrl) return { url: data.signedUrl, isMirror: true };
      }
    } catch {
      // fall through to the original source URL below
    }
  }
  return { url: item.source_url, isMirror: false };
}

export async function contributeDraft(
  userId: string,
  input: {
    title: string; court?: string; tags?: string[]; outcome?: string; excerpt?: string; fullText?: string;
    /** 'draft' (practitioner-filed document, default) or 'judgment' (a case a lawyer is logging manually). */
    kind?: 'judgment' | 'draft';
    citation?: string;
    year?: number;
    cnr?: string;
  },
): Promise<LibItem> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('library_items')
    .insert({
      kind: input.kind ?? 'draft',
      title: input.title,
      court: input.court ?? null,
      citation: input.citation ?? null,
      year: input.year ?? null,
      cnr: input.cnr ?? null,
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

// ============================================================
// Highlights / notes / hyperlinks (select text -> highlight -> sidebar)
// ============================================================

/** All of this user's highlights on one judgment/draft, each with its notes + links, in creation order. */
export async function listHighlightsForItem(userId: string, libraryItemId: string): Promise<HighlightDTO[]> {
  const sb = createSupabaseAdmin();

  const { data: hRows, error: hErr } = await sb
    .from('highlights')
    .select('*')
    .eq('library_item_id', libraryItemId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (hErr) throw hErr;
  const highlights = (hRows as DbHighlight[]) ?? [];
  if (highlights.length === 0) return [];

  const ids = highlights.map((h) => h.id);

  const [{ data: noteRows, error: nErr }, { data: linkRows, error: lErr }] = await Promise.all([
    sb.from('highlight_notes').select('*').in('highlight_id', ids).order('created_at', { ascending: true }),
    sb.from('highlight_links').select('*').in('highlight_id', ids).order('created_at', { ascending: true }),
  ]);
  if (nErr) throw nErr;
  if (lErr) throw lErr;
  const links = (linkRows as DbHighlightLink[]) ?? [];

  // Resolve display titles for internal link targets with two small bulk lookups
  // (kept flat/manual rather than a PostgREST nested embed, to avoid relying on
  // FK-inference syntax we haven't been able to test end-to-end).
  const itemIds = [...new Set(links.map((l) => l.target_library_item_id).filter(Boolean))] as string[];
  const matterIds = [...new Set(links.map((l) => l.target_matter_id).filter(Boolean))] as string[];

  const itemTitles = new Map<string, string>();
  if (itemIds.length) {
    const { data } = await sb.from('library_items').select('id,title').in('id', itemIds);
    (data ?? []).forEach((r: any) => itemTitles.set(r.id, r.title));
  }
  const matterTitles = new Map<string, string>();
  if (matterIds.length) {
    const { data } = await sb.from('matters').select('id,title').in('id', matterIds);
    (data ?? []).forEach((r: any) => matterTitles.set(r.id, r.title));
  }

  const notesByHighlight = new Map<string, DbHighlightNote[]>();
  ((noteRows as DbHighlightNote[]) ?? []).forEach((n) => {
    notesByHighlight.set(n.highlight_id, [...(notesByHighlight.get(n.highlight_id) ?? []), n]);
  });
  const linksByHighlight = new Map<string, DbHighlightLink[]>();
  links.forEach((l) => {
    linksByHighlight.set(l.highlight_id, [...(linksByHighlight.get(l.highlight_id) ?? []), l]);
  });

  return highlights.map((h) => ({
    id: h.id,
    blockId: h.block_id,
    matterId: h.matter_id,
    startOffset: h.start_offset,
    endOffset: h.end_offset,
    quoteText: h.quote_text,
    color: h.color,
    createdAt: h.created_at,
    notes: (notesByHighlight.get(h.id) ?? []).map((n) => ({
      id: n.id, body: n.body, createdAt: n.created_at, updatedAt: n.updated_at,
    })),
    links: (linksByHighlight.get(h.id) ?? []).map((l) => ({
      id: l.id,
      linkType: l.link_type,
      label: l.label,
      externalUrl: l.external_url,
      targetLibraryItemId: l.target_library_item_id,
      targetMatterId: l.target_matter_id,
      targetTitle: l.target_library_item_id
        ? itemTitles.get(l.target_library_item_id) ?? null
        : l.target_matter_id
        ? matterTitles.get(l.target_matter_id) ?? null
        : null,
    })),
  }));
}

export async function createHighlight(userId: string, input: {
  libraryItemId: string; blockId: string; startOffset: number; endOffset: number;
  quoteText: string; matterId?: string | null; color?: string;
}): Promise<DbHighlight> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlights')
    .insert({
      library_item_id: input.libraryItemId,
      block_id: input.blockId,
      user_id: userId,
      matter_id: input.matterId ?? null,
      start_offset: input.startOffset,
      end_offset: input.endOffset,
      quote_text: input.quoteText,
      color: input.color ?? 'yellow',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbHighlight;
}

/** Reassign (or clear) which matter a highlight is filed under. Returns false if not found/not owned. */
export async function updateHighlightMatter(userId: string, highlightId: string, matterId: string | null): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlights')
    .update({ matter_id: matterId })
    .eq('id', highlightId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return !!(data && data.length > 0);
}

/** Deletes the highlight and (via FK cascade) all of its notes and links. Returns false if not found/not owned. */
export async function deleteHighlight(userId: string, highlightId: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlights')
    .delete()
    .eq('id', highlightId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return !!(data && data.length > 0);
}

async function assertOwnsHighlight(sb: ReturnType<typeof createSupabaseAdmin>, userId: string, highlightId: string) {
  const { data, error } = await sb.from('highlights').select('id').eq('id', highlightId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Highlight not found');
}

export async function addHighlightNote(userId: string, highlightId: string, body: string): Promise<DbHighlightNote> {
  const sb = createSupabaseAdmin();
  await assertOwnsHighlight(sb, userId, highlightId);
  const { data, error } = await sb
    .from('highlight_notes')
    .insert({ highlight_id: highlightId, user_id: userId, body })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbHighlightNote;
}

export async function updateHighlightNote(userId: string, noteId: string, body: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlight_notes')
    .update({ body })
    .eq('id', noteId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return !!(data && data.length > 0);
}

export async function deleteHighlightNote(userId: string, noteId: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlight_notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return !!(data && data.length > 0);
}

export async function addHighlightLink(userId: string, highlightId: string, input: {
  linkType: HighlightLinkType; label?: string | null;
  externalUrl?: string | null; targetLibraryItemId?: string | null; targetMatterId?: string | null;
}): Promise<DbHighlightLink> {
  const sb = createSupabaseAdmin();
  await assertOwnsHighlight(sb, userId, highlightId);
  const { data, error } = await sb
    .from('highlight_links')
    .insert({
      highlight_id: highlightId,
      user_id: userId,
      link_type: input.linkType,
      label: input.label ?? null,
      external_url: input.linkType === 'external' ? input.externalUrl ?? null : null,
      target_library_item_id: input.linkType === 'library_item' ? input.targetLibraryItemId ?? null : null,
      target_matter_id: input.linkType === 'matter' ? input.targetMatterId ?? null : null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DbHighlightLink;
}

export async function deleteHighlightLink(userId: string, linkId: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('highlight_links')
    .delete()
    .eq('id', linkId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return !!(data && data.length > 0);
}
