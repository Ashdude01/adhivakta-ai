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
  bar_council_id: string | null;
  avatar_url: string | null;
  plan: string;
  theme: string | null;
  created_at: string;
  updated_at: string;
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
  parties: { client?: string; opposite?: string } | null;
  key_dates: Record<string, string> | null;
  description: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
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
