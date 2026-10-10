/**
 * Canonical Indian court vocabulary — shared by the Case Library's court
 * filter (multi-select) and the "Add to library" form's court picker.
 *
 * Names match the convention already used by the bulk ingestion script
 * (scripts/ingest-library.mjs sets court: "Delhi High Court", "Supreme
 * Court", etc.) so a filter checkbox does an exact match against
 * library_items.court for anything that came through ingestion. For
 * manually-added entries the Add-case form writes the same canonical
 * string, keeping the whole corpus on one vocabulary going forward.
 */

export const SUPREME_COURT = 'Supreme Court';

/** All 25 High Courts of India, in the "<Name> High Court" form the ingest script uses. */
export const HIGH_COURTS = [
  'Allahabad High Court',
  'Andhra Pradesh High Court',
  'Bombay High Court',
  'Calcutta High Court',
  'Chhattisgarh High Court',
  'Delhi High Court',
  'Gauhati High Court',
  'Gujarat High Court',
  'Himachal Pradesh High Court',
  'Jammu & Kashmir and Ladakh High Court',
  'Jharkhand High Court',
  'Karnataka High Court',
  'Kerala High Court',
  'Madhya Pradesh High Court',
  'Madras High Court',
  'Manipur High Court',
  'Meghalaya High Court',
  'Orissa High Court',
  'Patna High Court',
  'Punjab & Haryana High Court',
  'Rajasthan High Court',
  'Sikkim High Court',
  'Telangana High Court',
  'Tripura High Court',
  'Uttarakhand High Court',
] as const;

/** Specialised tribunals & commissions lawyers commonly cite/file before. */
export const TRIBUNALS = [
  'National Company Law Tribunal (NCLT)',
  'National Company Law Appellate Tribunal (NCLAT)',
  'Income Tax Appellate Tribunal (ITAT)',
  'Central Administrative Tribunal (CAT)',
  'National Consumer Disputes Redressal Commission (NCDRC)',
  'State Consumer Disputes Redressal Commission',
  'Debt Recovery Tribunal (DRT)',
  'Debt Recovery Appellate Tribunal (DRAT)',
  'National Green Tribunal (NGT)',
  'Armed Forces Tribunal',
] as const;

/** Catch-all for everything below the HC — one District/Sessions Court entry plus free text. */
export const OTHER_COURT_LABEL = 'District / Sessions / Other Court';

/** Grouped shape the court picker (filter dropdown + add-case <select>) renders directly. */
export const COURT_GROUPS: { label: string; courts: readonly string[] }[] = [
  { label: 'Supreme Court', courts: [SUPREME_COURT] },
  { label: 'High Courts', courts: HIGH_COURTS },
  { label: 'Tribunals & Commissions', courts: TRIBUNALS },
  { label: 'Other', courts: [OTHER_COURT_LABEL] },
];

/** Flat list of every canonical court name, for validation/lookup. */
export const ALL_COURTS: string[] = COURT_GROUPS.flatMap((g) => [...g.courts]);
