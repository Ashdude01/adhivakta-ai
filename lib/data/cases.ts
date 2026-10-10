export type LibItem = {
  id: string;
  kind: 'judgment' | 'draft';
  title: string;
  court: string;
  citation?: string;
  /** Year decided/filed — the only date precision the corpus carries. */
  year?: number;
  /** Case Number Record — only populated for AWS-ingested judgments that had it in their metadata. */
  cnr?: string;
  tags: string[];
  author?: string;
  outcome?: string;
  excerpt: string;
  uses?: number;
  cited?: number;
  verified?: boolean;
  sourceUrl?: string;
};

/**
 * Offline seed for the Case & Draft Library. No API needed.
 * In production this is backed by the Indian Kanoon API + a Postgres/pgvector
 * store of community-contributed drafts.
 */
export const LIBRARY: LibItem[] = [
  {
    id: 'j1', kind: 'judgment', title: 'Dashrath Rupsingh Rathod v. State of Maharashtra',
    court: 'Supreme Court', citation: '(2014) 9 SCC 129', tags: ['§138', 'Jurisdiction', 'Cheque Bounce'],
    excerpt: 'Landmark ruling on territorial jurisdiction for cheque dishonour cases and computation of limitation.',
    cited: 412, verified: true,
  },
  {
    id: 'd1', kind: 'draft', title: '§138 Legal Notice — Insufficient Funds',
    court: 'Kerala HC', tags: ['§138', 'Notice', 'Cheque Bounce'], author: 'Adv. P. Nair', outcome: 'Settled',
    excerpt: 'Battle-tested notice format that secured pre-litigation settlement in 11 days. Includes interest computation clause.',
    uses: 1240, verified: true,
  },
  {
    id: 'j2', kind: 'judgment', title: 'MSR Leathers v. S. Palaniappan',
    court: 'Supreme Court', citation: '(2013) 1 SCC 177', tags: ['§138', 'Successive Notices'],
    excerpt: 'On the right to issue successive demand notices and re-presentation of cheques under the NI Act.',
    cited: 288, verified: true,
  },
  {
    id: 'd2', kind: 'draft', title: 'Complaint u/s 138 — Magistrate Court',
    court: 'Telangana', tags: ['§138', 'Complaint', 'Cheque Bounce'], author: 'Adv. S. Reddy', outcome: 'Convicted',
    excerpt: 'Full complaint format with evidence list and witness affidavit annexures, ready to adapt.',
    uses: 860, verified: true,
  },
  {
    id: 'j3', kind: 'judgment', title: 'Yogendra Pratap Singh v. Savitri Pandey',
    court: 'Supreme Court', citation: '(2014) 10 SCC 713', tags: ['§138', 'Limitation'],
    excerpt: 'On premature complaints and the mandatory 15-day waiting period before filing under §138.',
    cited: 197, verified: true,
  },
  {
    id: 'j4', kind: 'judgment', title: 'Kusum Ingots & Alloys Ltd. v. Pennar Peterson',
    court: 'Supreme Court', citation: '(2000) 2 SCC 745', tags: ['§138', 'Notice', 'Limitation'],
    excerpt: 'Clarifies the five components required to constitute an offence under Section 138.',
    cited: 154, verified: true,
  },
  {
    id: 'd3', kind: 'draft', title: 'Bail Application — Sessions Court',
    court: 'Rajasthan', tags: ['Bail', 'CrPC'], author: 'Adv. M. Khan', outcome: 'Granted',
    excerpt: 'Regular bail application with grounds, precedents and undertaking, formatted for sessions court.',
    uses: 540, verified: true,
  },
  {
    id: 'd4', kind: 'draft', title: 'Consumer Complaint — District Forum',
    court: 'Maharashtra', tags: ['Consumer', 'Deficiency'], author: 'Adv. R. Iyer', outcome: 'Compensated',
    excerpt: 'Deficiency-in-service complaint with prayer for compensation and litigation costs.',
    uses: 720, verified: true,
  },
  {
    id: 'd5', kind: 'draft', title: 'Rent & Eviction Notice — Rent Control',
    court: 'Delhi', tags: ['Rent', 'Eviction'], author: 'Adv. N. Bansal', outcome: 'Vacated',
    excerpt: 'Eviction notice for non-payment of rent, compliant with Delhi Rent Control Act timelines.',
    uses: 410, verified: true,
  },
];

/** Quick kind filter for the Case Library's top tab row. */
export const LIB_KIND_TABS = [
  { value: '', label: 'All' },
  { value: 'judgment', label: 'Judgments' },
  { value: 'draft', label: 'Drafts' },
] as const;
