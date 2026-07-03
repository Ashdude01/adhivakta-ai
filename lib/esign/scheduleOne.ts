/**
 * IT Act, 2000 — Schedule I eligibility check.
 * Certain documents CANNOT be electronically signed in India. We block them.
 */
const EXCLUDED: { match: RegExp; label: string }[] = [
  { match: /\bwill\b|testament|codicil/i, label: 'Wills & testamentary dispositions' },
  { match: /power of attorney|\bpoa\b/i, label: 'Powers of Attorney' },
  { match: /trust deed|trust\b/i, label: 'Trust deeds' },
  { match: /sale deed|conveyance|immovable property|real estate/i, label: 'Sale of immovable property' },
  { match: /negotiable instrument|promissory note|bill of exchange/i, label: 'Negotiable instruments (except cheques)' },
];

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  category?: string;
}

export function checkEligibility(documentNameOrType: string): EligibilityResult {
  const t = documentNameOrType || '';
  for (const e of EXCLUDED) {
    if (e.match.test(t)) {
      return {
        eligible: false,
        category: e.label,
        reason: `${e.label} are excluded under Schedule I of the IT Act, 2000 and cannot be e-signed. A physical/registered signature is required.`,
      };
    }
  }
  return { eligible: true, reason: 'This document is not excluded under IT Act Schedule I. Aadhaar eSign, DSC and DocuSign are available.' };
}
