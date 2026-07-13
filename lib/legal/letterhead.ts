/**
 * The advocate's letterhead — the block a legal notice is issued under.
 *
 * Pure and shared: the profile screen previews the letterhead with this, and
 * the drafting prompt is handed the exact same text, so what an advocate sees
 * while filling their profile is what appears at the top of every notice.
 */

export interface Advocate {
  name: string;
  designation?: string | null;
  firm_name?: string | null;
  enrolment_no?: string | null;
  bar_council?: string | null;
  office_address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
}

/** "12, MG Road, Civil Lines, Jaipur, Rajasthan – 302001" */
export function advocateAddress(a: Advocate): string {
  const line = [a.office_address, a.city, a.state].map((p) => p?.trim()).filter(Boolean).join(', ');
  return a.pincode ? `${line} – ${a.pincode}` : line;
}

export interface LetterheadLine { text: string; strong?: boolean }

/** The letterhead as ordered lines, so a preview can bold the name and centre it. */
export function letterheadLines(a: Advocate): LetterheadLine[] {
  const lines: LetterheadLine[] = [];
  const title = [a.name?.trim(), a.designation?.trim() || 'Advocate'].filter(Boolean).join(', ');
  if (title) lines.push({ text: title, strong: true });
  if (a.firm_name?.trim()) lines.push({ text: a.firm_name.trim() });

  const enrol = [
    a.enrolment_no?.trim() && `Enrolment No. ${a.enrolment_no.trim()}`,
    a.bar_council?.trim(),
  ].filter(Boolean).join(', ');
  if (enrol) lines.push({ text: enrol });

  const address = advocateAddress(a);
  if (address) lines.push({ text: address });

  const contact = [
    [a.phone?.trim(), a.alt_phone?.trim()].filter(Boolean).join(' / '),
    a.email?.trim(),
  ].filter(Boolean).join('  ·  ');
  if (contact) lines.push({ text: contact });

  return lines;
}

/** Plain-text letterhead, for the AI prompt and any text export. */
export function letterheadText(a: Advocate): string {
  return letterheadLines(a).map((l) => l.text).join('\n');
}

/** The fields a notice legally needs. Drives the "profile incomplete" warning. */
export const NOTICE_REQUIRED: Array<{ key: keyof Advocate; label: string }> = [
  { key: 'name', label: 'Full name' },
  { key: 'enrolment_no', label: 'Bar Council enrolment number' },
  { key: 'office_address', label: 'Office address' },
  { key: 'city', label: 'City' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

export function missingForNotice(a: Advocate): string[] {
  return NOTICE_REQUIRED.filter(({ key }) => !String(a[key] ?? '').trim()).map(({ label }) => label);
}

export function isNoticeReady(a: Advocate): boolean {
  return missingForNotice(a).length === 0;
}
