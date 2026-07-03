// Rule-based PII anonymiser for the contribution pipeline (plan §6.3).
// Deterministic patterns for Indian legal documents: identity numbers, contact
// details, financial instruments, case identifiers and honorific-prefixed names.
// An LLM sweep can be layered on top later; the rules below are the floor.

export interface PiiFinding {
  kind: string;
  original: string;
  replacement: string;
}

export interface AnonymiseResult {
  anonymisedText: string;
  report: PiiFinding[];
}

interface Rule {
  kind: string;
  re: RegExp;
  replacement: (match: string, counter: number) => string;
}

const RULES: Rule[] = [
  // Identity numbers first (most specific)
  { kind: 'aadhaar', re: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, replacement: (_, i) => `[AADHAAR-${i}]` },
  { kind: 'pan', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replacement: (_, i) => `[PAN-${i}]` },
  { kind: 'cnr', re: /\b[A-Z]{4}\d{2}-?\d{6}-?\d{4}\b/g, replacement: (_, i) => `[CNR-${i}]` },
  { kind: 'gstin', re: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]{2}\b/g, replacement: (_, i) => `[GSTIN-${i}]` },
  // Contact details
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, replacement: (_, i) => `[EMAIL-${i}]` },
  { kind: 'phone', re: /(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}\b/g, replacement: (_, i) => `[PHONE-${i}]` },
  // Financial / instrument identifiers
  { kind: 'cheque_no', re: /\b(cheque|chq\.?)\s*(no\.?|number|bearing no\.?)\s*[:\-]?\s*\d{6}\b/gi, replacement: (_, i) => `[CHEQUE-${i}]` },
  { kind: 'account_no', re: /\b(a\/c|account)\s*(no\.?|number)\s*[:\-]?\s*[\dXx*]{9,18}\b/gi, replacement: (_, i) => `[ACCOUNT-${i}]` },
  { kind: 'ifsc', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, replacement: (_, i) => `[IFSC-${i}]` },
  // Case identifiers
  { kind: 'case_no', re: /\b(C\.?C\.?|Crl\.?|C\.?S\.?|O\.?S\.?|W\.?P\.?|Complaint Case)\s*(No\.?)\s*[:\-]?\s*\d+\s*(of|\/)\s*\d{4}\b/gi, replacement: (_, i) => `[CASE-${i}]` },
  // Honorific-prefixed names (Mr./Mrs./Ms./Shri/Smt./Dr./Adv.)
  {
    kind: 'name',
    re: /\b(Mr|Mrs|Ms|Shri|Smt|Dr|Adv|Advocate|M\/s)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g,
    replacement: (_, i) => `[PARTY-${i}]`,
  },
];

/**
 * Redact PII from draft text before community contribution. Returns the
 * anonymised text plus a full report of every replacement (the contributor
 * confirms each one — they remain responsible for client confidentiality).
 */
export function anonymise(text: string): AnonymiseResult {
  const report: PiiFinding[] = [];
  let out = text;
  // Consistent replacements: same original → same placeholder within the doc.
  const seen = new Map<string, string>();

  for (const rule of RULES) {
    let counter = 0;
    out = out.replace(rule.re, (match) => {
      const key = `${rule.kind}:${match.toLowerCase().trim()}`;
      let repl = seen.get(key);
      if (!repl) {
        counter += 1;
        repl = rule.replacement(match, counter);
        seen.set(key, repl);
        report.push({ kind: rule.kind, original: match, replacement: repl });
      }
      return repl;
    });
  }
  return { anonymisedText: out, report };
}

/** Residual-PII check used as the automated moderation gate before publishing. */
export function residualPii(text: string): PiiFinding[] {
  const { report } = anonymise(text);
  return report;
}
