/**
 * What a court-ready Indian legal notice must contain.
 *
 * This is the drafting research turned into an instruction the model must
 * follow, kept in one place so the standard is auditable and the same for every
 * notice. The §138 notice is treated most strictly: the Supreme Court has held
 * that a defective statutory demand notice makes the whole cheque-bounce
 * complaint void, so its mandatory elements are non-negotiable.
 */

export function isNoticeDocType(docType: string): boolean {
  return /\bnotice\b/i.test(docType);
}

function is138(docType: string): boolean {
  return /138|cheque|dishonou?r/i.test(docType);
}

function isReply(docType: string): boolean {
  return /\breply\b/i.test(docType);
}

/** The skeleton every notice follows, top to bottom. */
const COMMON_SKELETON = [
  '1. Begin with the ADVOCATE LETTERHEAD exactly as given in the advocate context, centred — do not invent or alter any of these particulars.',
  '2. Below the letterhead: the date in DD/MM/YYYY, and the mode of dispatch, e.g. "BY REGISTERED POST A.D. & EMAIL".',
  '3. A reference line if a ref number is available, else omit it.',
  "4. The addressee block: the opposite party's full name and complete postal address with pincode, taken from the matter context.",
  '5. The heading "WITHOUT PREJUDICE" and then a single precise SUBJECT line naming the notice and the statute it is under.',
  '6. Salutation, then "Under instructions from and on behalf of my client, <client with full description>, I hereby serve upon you the following notice:".',
  '7. Numbered paragraphs stating the facts in chronological order, using only the particulars given — never invent a date, amount, cheque number or address.',
  '8. A clear paragraph stating the exact relief/demand.',
  '9. The consequences of non-compliance.',
  '10. Close with the advocate signature block: signature, name, designation and Bar Council enrolment number.',
  '11. End with: "A copy of this notice is retained in my office for record and further necessary action."',
];

const S138_EXTRA = [
  'This is a statutory demand notice under the proviso (b) to Section 138 of the Negotiable Instruments Act, 1881. It MUST:',
  '  a. explicitly demand payment of the exact cheque amount (not a rounded or different figure);',
  '  b. call upon the drawer to pay within FIFTEEN (15) DAYS of receipt of the notice;',
  '  c. recite the cheque number, cheque date, drawee bank, the presentation, and the date and reason of dishonour from the dishonour memo;',
  '  d. warn that on default, criminal proceedings under Section 138 read with Section 142 of the NI Act will be initiated, besides civil recovery.',
  'Wrap the statute reference as [[Section 138 of the Negotiable Instruments Act, 1881]] so the app can verify it.',
];

const REPLY_EXTRA = [
  'This is a REPLY to a notice received, not a fresh demand. Address the received notice by its date, rebut its allegations paragraph by paragraph, assert your client\'s defence, and do not concede liability.',
];

export function noticeInstructions(docType: string): string {
  if (!isNoticeDocType(docType)) return '';
  const parts: string[] = [
    'DRAFT A LEGAL NOTICE IN CORRECT INDIAN FORMAT. Follow this structure exactly:',
    ...COMMON_SKELETON,
  ];
  if (isReply(docType)) parts.push('', ...REPLY_EXTRA);
  else if (is138(docType)) parts.push('', ...S138_EXTRA);
  parts.push(
    '',
    'If any required particular is missing from the context, insert a clearly bracketed placeholder such as [DATE OF SERVICE] or [CHEQUE NUMBER] rather than guessing.',
  );
  return parts.join('\n');
}
