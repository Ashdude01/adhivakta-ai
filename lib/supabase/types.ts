// Row shapes for the Supabase tables. Hand-maintained (kept in sync with
// supabase/migrations). Server data modules cast query results to these.

export interface DbUser {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  firm_name: string | null;
  phone: string | null;
  /** @deprecated superseded by enrolment_no. */
  bar_council_id: string | null;
  avatar_url: string | null;
  plan: string;
  theme: string | null;

  // Letterhead — the particulars a legal notice must be issued under.
  designation: string;
  enrolment_no: string | null;
  bar_council: string | null;
  office_address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  alt_phone: string | null;

  created_at: string;
  updated_at: string;
}

export type EntityType =
  | 'individual' | 'company' | 'partnership' | 'proprietorship'
  | 'huf' | 'trust' | 'society' | 'government';

/** Relation shown in a cause title: "Rajesh Sharma, S/o Mohan Lal". */
export type RelationType = 's/o' | 'd/o' | 'w/o' | 'h/o' | 'c/o';

export interface DbContact {
  id: string;
  user_id: string;
  entity_type: EntityType;
  salutation: string | null;
  full_name: string;
  aka_names: string[];
  age: number | null;
  gender: string | null;
  relation_type: RelationType | null;
  relation_name: string | null;
  occupation: string | null;
  address_line: string | null;
  village_town: string | null;
  taluka: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  mobile: string | null;
  email: string | null;
  pan: string | null;
  /** Last four digits only — full Aadhaar is never stored (DPDP minimisation). */
  aadhaar_last4: string | null;
  is_minor: boolean;
  is_unsound_mind: boolean;
  guardian_contact_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMatterParty {
  id: string;
  matter_id: string;
  contact_id: string;
  role: string;
  side: 'client' | 'opposite' | 'other';
  party_no: number;
  advocate_name: string | null;
  address_for_service: string | null;
  created_at: string;
}

/** A matter party joined to the contact it points at — what the UI and AI read. */
export interface MatterPartyWithContact extends DbMatterParty {
  contact: DbContact;
}

export interface DbMatter {
  id: string;
  user_id: string;
  code: string;
  title: string;
  subtitle: string | null;
  court: string | null;
  status: string;
  tag: string | null;
  tag_class: string | null;
  color: string | null;
  matter_type: string | null;
  matter_type_code: string | null;
  practice_area: string | null;
  client_ref: string | null;
  description: string | null;

  facts: Record<string, unknown>;
  relief_sought: string | null;
  suit_value: number | null;

  court_complex: string | null;
  district: string | null;
  state: string | null;

  cnr: string | null;
  case_type: string | null;
  case_number: string | null;
  case_year: number | null;
  filing_number: string | null;
  act: string | null;
  section: string | null;
  filed_on: string | null;
  next_hearing_date: string | null;
  opened_on: string;

  /** @deprecated superseded by matter_parties + contacts. Legacy rows only. */
  parties: { client?: string; opposite?: string } | null;
  /** @deprecated superseded by `facts`. Legacy rows only. */
  key_dates: Record<string, string> | null;

  created_at: string;
  updated_at: string;
}

export interface DbMatterDocument {
  id: string;
  user_id: string;
  matter_id: string;
  /** Object key inside the private bucket. Never handed to the browser. */
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
  description: string | null;
  uploaded_at: string;
}

/** A matter with its parties resolved. Returned by getMatterFull(). */
export interface MatterFull extends DbMatter {
  parties_list: MatterPartyWithContact[];
}

export interface DbDraft {
  id: string;
  user_id: string;
  matter_id: string | null;
  doc_type: string | null;
  title: string | null;
  body: string | null;
  language: string | null;
  provider: string | null;
  meta: Record<string, unknown> | null;
  status: string;
  template_id: string | null;
  intake: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbDraftVersion {
  id: string;
  draft_id: string;
  version_no: number;
  content: string;
  source: 'ai' | 'human' | 'ai-command';
  provider: string | null;
  verifier_report: VerifierReport | null;
  created_at: string;
}

export interface VerifierClaim {
  claim: string;
  source_kind: 'statute' | 'judgment' | 'draft' | 'unknown';
  verified: boolean;
  verify_url: string | null;
  library_item_id: string | null;
  note?: string;
}

export interface VerifierReport {
  checked: number;
  passed: number;
  failed: number;
  overridden?: boolean;
  claims: VerifierClaim[];
}

export interface DbLibraryItem {
  id: string;
  slug: string | null;
  kind: 'judgment' | 'draft';
  title: string;
  court: string | null;
  citation: string | null;
  tags: string[];
  author: string | null;
  outcome: string | null;
  excerpt: string | null;
  uses: number;
  cited: number;
  verified: boolean;
  contributed_by: string | null;
  source_url: string | null;
  sections: string[];
  year: number | null;
  full_text: string | null;
  /** CNR (Case Number Record) — only populated for AWS-ingested judgments that had it in their metadata sidecar. */
  cnr: string | null;
  /** Which bulk ingest this judgment came from, e.g. 'sc-aws-dattam' / 'hc-aws-dattam'. Null for community drafts. */
  source_dataset: string | null;
  created_at: string;
}

/** A paragraph/chunk of a judgment's extracted text (supabase/migrations/0007). Used to anchor highlights. */
export interface DbLibraryItemBlock {
  id: string;
  library_item_id: string;
  seq: number;
  page_no: number | null;
  text: string;
  created_at: string;
}

/**
 * A user's text-selection highlight on one block of a judgment/draft.
 * Private to the user who made it; optionally filed under one of their matters.
 */
export interface DbHighlight {
  id: string;
  library_item_id: string;
  block_id: string;
  user_id: string;
  matter_id: string | null;
  start_offset: number;
  end_offset: number;
  quote_text: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface DbHighlightNote {
  id: string;
  highlight_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export type HighlightLinkType = 'external' | 'library_item' | 'matter';

export interface DbHighlightLink {
  id: string;
  highlight_id: string;
  user_id: string;
  link_type: HighlightLinkType;
  label: string | null;
  external_url: string | null;
  target_library_item_id: string | null;
  target_matter_id: string | null;
  created_at: string;
}

/** Composed view returned to the client: one highlight + its notes + its links. */
export interface HighlightDTO {
  id: string;
  blockId: string;
  matterId: string | null;
  startOffset: number;
  endOffset: number;
  quoteText: string;
  color: string;
  createdAt: string;
  notes: Array<{ id: string; body: string; createdAt: string; updatedAt: string }>;
  links: Array<{
    id: string;
    linkType: HighlightLinkType;
    label: string | null;
    externalUrl: string | null;
    targetLibraryItemId: string | null;
    targetMatterId: string | null;
    /** Resolved title of the target judgment/matter, for display — null for external links. */
    targetTitle: string | null;
  }>;
}

export interface DbEsignRequest {
  id: string;
  user_id: string;
  matter_id: string | null;
  document_name: string;
  method: string;
  status: string;
  envelope_id: string | null;
  signers: unknown;
  signature_url: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface DbReviewSession {
  id: string;
  user_id: string;
  filename: string | null;
  context: string | null;
  matter_id: string | null;
  summary: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface DbReviewChunk {
  id: string;
  session_id: string;
  seq: number;
  text: string;
  created_at: string;
}

export interface DbChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'ai';
  content: string;
  citations: Array<{ seq: number; quote?: string }> | null;
  created_at: string;
}

export interface DbAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  ip: string | null;
  meta: Record<string, unknown> | null;
  at: string;
}

export interface DbConsent {
  id: string;
  user_id: string;
  purpose: string;
  granted: boolean;
  version: string;
  created_at: string;
}

export interface DbContribution {
  id: string;
  user_id: string;
  draft_id: string | null;
  title: string;
  raw_text: string;
  anonymised_text: string;
  pii_report: Array<{ kind: string; original: string; replacement: string }> | null;
  status: 'pending' | 'approved' | 'rejected';
  moderator_note: string | null;
  library_item_id: string | null;
  court: string | null;
  tags: string[];
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbEsignEvent {
  id: string;
  esign_request_id: string;
  event: string;
  payload: Record<string, unknown> | null;
  at: string;
}
