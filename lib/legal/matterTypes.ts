import { z } from 'zod';
import { blank } from '@/lib/validation/zod';

/**
 * The matter-type registry.
 *
 * A matter type decides three things the rest of the app reads:
 *   1. what the two sides are called (a §138 matter has a Complainant and an
 *      Accused; a recovery suit has a Plaintiff and a Defendant),
 *   2. which statute the matter arises under, and
 *   3. which case facts the advocate is asked for once, at intake.
 *
 * Facts are declared here, not hard-coded into the form or the AI prompt, so
 * deepening a type later — adding the cheque/notice dates a §138 limitation
 * clock needs — is an edit to this file. It never needs a migration, because
 * facts land in the `matters.facts` jsonb column.
 */

export type PartyRole =
  | 'petitioner' | 'respondent'
  | 'plaintiff' | 'defendant'
  | 'complainant' | 'accused'
  | 'appellant'
  | 'applicant'
  | 'claimant'
  | 'opposite_party'
  | 'third_party';

export const PARTY_ROLES: readonly PartyRole[] = [
  'petitioner', 'respondent', 'plaintiff', 'defendant', 'complainant', 'accused',
  'appellant', 'applicant', 'claimant', 'opposite_party', 'third_party',
] as const;

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  petitioner: 'Petitioner',
  respondent: 'Respondent',
  plaintiff: 'Plaintiff',
  defendant: 'Defendant',
  complainant: 'Complainant',
  accused: 'Accused',
  appellant: 'Appellant',
  applicant: 'Applicant',
  claimant: 'Claimant',
  opposite_party: 'Opposite Party',
  third_party: 'Third Party',
};

export type FactType = 'text' | 'textarea' | 'date' | 'amount' | 'number' | 'select';

export interface FactField {
  key: string;
  label: string;
  type: FactType;
  /** Recommended for a usable draft. Advisory only — intake always saves partial. */
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
}

export interface MatterTypeDef {
  code: string;
  label: string;
  /** 2–3 char badge shown on the matter card. */
  shortCode: string;
  practiceArea: string;
  courts: string[];
  act?: string;
  section?: string;
  roles: { client: PartyRole; opposite: PartyRole };
  facts: FactField[];
}

/** Asked on every matter regardless of type, so the AI always has a fact base. */
const COMMON_FACTS: FactField[] = [
  {
    key: 'brief_facts',
    label: 'Brief facts',
    type: 'textarea',
    required: true,
    placeholder: 'What happened, in the order it happened.',
    help: 'This is the fact base every draft and review is grounded in. Write it once, properly.',
  },
  {
    key: 'cause_of_action_date',
    label: 'Date cause of action arose',
    type: 'date',
    help: 'Order VII r.1(e) CPC. Also the date limitation starts running from.',
  },
];

export const MATTER_TYPES: MatterTypeDef[] = [
  {
    code: 'ni138',
    label: 'Cheque Bounce — NI Act §138',
    shortCode: '138',
    practiceArea: 'Criminal — Negotiable Instruments',
    courts: ['Magistrate Court', 'Sessions Court', 'District Court', 'High Court', 'Other / Not yet filed'],
    act: 'Negotiable Instruments Act, 1881',
    section: '138',
    roles: { client: 'complainant', opposite: 'accused' },
    facts: [
      { key: 'cheque_number', label: 'Cheque number', type: 'text', required: true },
      { key: 'cheque_date', label: 'Cheque date', type: 'date', required: true },
      { key: 'cheque_amount', label: 'Cheque amount (₹)', type: 'amount', required: true },
      { key: 'drawer_bank', label: 'Drawer bank & branch', type: 'text' },
      { key: 'dishonour_date', label: 'Dishonour memo date', type: 'date', required: true },
      { key: 'dishonour_reason', label: 'Reason for dishonour', type: 'select', options: ['Funds insufficient', 'Account closed', 'Payment stopped by drawer', 'Signature mismatch', 'Exceeds arrangement', 'Other'] },
      { key: 'demand_notice_date', label: 'Demand notice date', type: 'date', help: 'The §138 proviso (b) notice sent within 30 days of dishonour.' },
      { key: 'notice_service_date', label: 'Notice served on', type: 'date', help: 'Payment window of 15 days runs from this date.' },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'recovery',
    label: 'Money Recovery Suit',
    shortCode: 'MR',
    practiceArea: 'Civil — Recovery',
    courts: ['District Court', 'Commercial Court', 'High Court', 'Other / Not yet filed'],
    act: 'Code of Civil Procedure, 1908',
    roles: { client: 'plaintiff', opposite: 'defendant' },
    facts: [
      { key: 'principal_amount', label: 'Principal amount (₹)', type: 'amount', required: true },
      { key: 'interest_rate', label: 'Interest claimed (% p.a.)', type: 'number' },
      { key: 'debt_basis', label: 'Basis of the debt', type: 'select', options: ['Loan', 'Unpaid invoice', 'Goods supplied', 'Services rendered', 'Dishonoured cheque', 'Other'] },
      { key: 'last_payment_date', label: 'Date of last payment / acknowledgement', type: 'date', help: 'Limitation under the Limitation Act, 1963 runs afresh from an acknowledgement.' },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'consumer',
    label: 'Consumer Complaint',
    shortCode: 'CC',
    practiceArea: 'Consumer',
    courts: ['District Consumer Commission', 'State Consumer Commission', 'National Consumer Commission (NCDRC)', 'Other / Not yet filed'],
    act: 'Consumer Protection Act, 2019',
    roles: { client: 'complainant', opposite: 'opposite_party' },
    facts: [
      { key: 'goods_or_service', label: 'Goods or service complained of', type: 'text', required: true },
      { key: 'consideration_paid', label: 'Amount paid (₹)', type: 'amount', required: true, help: 'Decides pecuniary jurisdiction: District ≤ ₹50L, State ≤ ₹2Cr, National above.' },
      { key: 'purchase_date', label: 'Date of purchase / service', type: 'date' },
      { key: 'defect_type', label: 'Nature of grievance', type: 'select', options: ['Defect in goods', 'Deficiency in service', 'Unfair trade practice', 'Overcharging', 'Hazardous goods'] },
      { key: 'compensation_claimed', label: 'Compensation claimed (₹)', type: 'amount' },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'mact',
    label: 'Motor Accident Claim (MACT)',
    shortCode: 'MC',
    practiceArea: 'Motor Accident',
    courts: ['Motor Accident Claims Tribunal (MACT)', 'High Court', 'Other / Not yet filed'],
    act: 'Motor Vehicles Act, 1988',
    section: '166',
    roles: { client: 'claimant', opposite: 'respondent' },
    facts: [
      { key: 'accident_date', label: 'Date of accident', type: 'date', required: true },
      { key: 'accident_place', label: 'Place of accident', type: 'text', required: true },
      { key: 'fir_number', label: 'FIR number', type: 'text' },
      { key: 'police_station', label: 'Police station', type: 'text' },
      { key: 'offending_vehicle_no', label: 'Offending vehicle number', type: 'text' },
      { key: 'injury_type', label: 'Nature of injury', type: 'select', options: ['Death', 'Permanent disability', 'Grievous injury', 'Simple injury'] },
      { key: 'compensation_claimed', label: 'Compensation claimed (₹)', type: 'amount' },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'rent',
    label: 'Rent & Eviction',
    shortCode: 'RE',
    practiceArea: 'Civil — Landlord & Tenant',
    courts: ['Rent Control', 'District Court', 'Small Causes Court', 'Other / Not yet filed'],
    roles: { client: 'petitioner', opposite: 'respondent' },
    facts: [
      { key: 'property_address', label: 'Tenanted premises', type: 'textarea', required: true },
      { key: 'monthly_rent', label: 'Monthly rent (₹)', type: 'amount', required: true },
      { key: 'tenancy_start', label: 'Tenancy commenced on', type: 'date' },
      { key: 'arrears_amount', label: 'Rent arrears (₹)', type: 'amount' },
      { key: 'eviction_ground', label: 'Ground for eviction', type: 'select', options: ['Non-payment of rent', 'Bona fide requirement', 'Subletting', 'Material alteration', 'Nuisance', 'Expiry of lease'] },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'bail',
    label: 'Bail / Criminal',
    shortCode: 'BA',
    practiceArea: 'Criminal',
    courts: ['Magistrate Court', 'Sessions Court', 'High Court', 'Other / Not yet filed'],
    act: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
    roles: { client: 'applicant', opposite: 'respondent' },
    facts: [
      { key: 'fir_number', label: 'FIR number & year', type: 'text', required: true },
      { key: 'police_station', label: 'Police station', type: 'text', required: true },
      { key: 'offence_sections', label: 'Sections charged', type: 'text', required: true, placeholder: 'e.g. BNS §§ 318(4), 316(2)' },
      { key: 'arrest_date', label: 'Date of arrest', type: 'date' },
      { key: 'custody_status', label: 'Custody status', type: 'select', options: ['In judicial custody', 'In police custody', 'Anticipatory — not arrested', 'On interim bail'] },
      { key: 'bail_stage', label: 'Stage', type: 'select', options: ['Anticipatory bail', 'Regular bail — first', 'Regular bail — successive', 'Bail after chargesheet', 'Default bail'] },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'family',
    label: 'Family / Matrimonial',
    shortCode: 'FM',
    practiceArea: 'Family',
    courts: ['Family Court', 'District Court', 'Magistrate Court', 'High Court', 'Other / Not yet filed'],
    roles: { client: 'petitioner', opposite: 'respondent' },
    facts: [
      { key: 'relief_type', label: 'Relief sought', type: 'select', required: true, options: ['Divorce — contested', 'Divorce — mutual consent', 'Judicial separation', 'Restitution of conjugal rights', 'Maintenance', 'Child custody', 'Domestic violence — protection order'] },
      { key: 'marriage_date', label: 'Date of marriage', type: 'date' },
      { key: 'marriage_place', label: 'Place of marriage', type: 'text' },
      { key: 'separation_date', label: 'Living separately since', type: 'date' },
      { key: 'children', label: 'Children (names & ages)', type: 'textarea' },
      { key: 'personal_law', label: 'Governing law', type: 'select', options: ['Hindu Marriage Act, 1955', 'Special Marriage Act, 1954', 'Indian Divorce Act, 1869', 'Muslim personal law', 'Parsi Marriage and Divorce Act, 1936'] },
      ...COMMON_FACTS,
    ],
  },
  {
    code: 'other',
    label: 'Other',
    shortCode: 'GN',
    practiceArea: 'General',
    courts: ['District Court', 'Magistrate Court', 'Sessions Court', 'High Court', 'Tribunal', 'Other / Not yet filed'],
    roles: { client: 'petitioner', opposite: 'respondent' },
    facts: [...COMMON_FACTS],
  },
];

const BY_CODE = new Map(MATTER_TYPES.map((t) => [t.code, t]));

export function getMatterType(code: string | null | undefined): MatterTypeDef | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

/** The registry entry to fall back on when a stored code is unknown or legacy. */
export const DEFAULT_MATTER_TYPE = BY_CODE.get('other')!;

/**
 * Zod schema for one type's facts.
 *
 * Every field is optional: intake saves partial matters on purpose, because an
 * advocate opening a file at 11pm rarely has the dishonour memo in hand. The
 * `required` flag on a FactField drives the form's prompting, not this schema.
 */
export function factsSchemaFor(code: string | null | undefined): z.ZodType<Record<string, unknown>> {
  const def = getMatterType(code) ?? DEFAULT_MATTER_TYPE;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.facts) {
    switch (f.type) {
      case 'amount':
      case 'number':
        shape[f.key] = blank(z.coerce.number().nonnegative());
        break;
      case 'date':
        shape[f.key] = blank(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label} must be a date`));
        break;
      case 'select':
        shape[f.key] = blank(f.options?.length ? z.enum(f.options as [string, ...string[]]) : z.string().max(200));
        break;
      case 'textarea':
        shape[f.key] = blank(z.string().trim().max(5000));
        break;
      default:
        shape[f.key] = blank(z.string().trim().max(300));
    }
  }
  // Unknown keys are dropped rather than rejected, so a matter saved under an
  // older version of a type definition still validates after fields are renamed.
  return z.object(shape).strip();
}

export interface LabelledFact {
  key: string;
  label: string;
  type: FactType;
  /** The stored value, as text. Callers format by `type`. */
  value: string;
}

/** Facts in the order the type declares them. Empty values dropped. */
export function labelledFacts(
  code: string | null | undefined,
  facts: Record<string, unknown> | null | undefined,
): LabelledFact[] {
  if (!facts) return [];
  const def = getMatterType(code) ?? DEFAULT_MATTER_TYPE;
  const out: LabelledFact[] = [];
  for (const f of def.facts) {
    const raw = facts[f.key];
    if (raw === undefined || raw === null || raw === '') continue;
    out.push({ key: f.key, label: f.label, type: f.type, value: String(raw) });
  }
  return out;
}

/** Indian digit grouping: 4,50,000 rather than 450,000. */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

/** "12 May 2026" from a stored YYYY-MM-DD. Returns the input if unparseable. */
export function formatFactDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One fact rendered the way a person reads it. */
export function formatFactValue(fact: LabelledFact): string {
  if (fact.type === 'amount') {
    const n = Number(fact.value);
    return Number.isNaN(n) ? fact.value : `₹${formatAmount(n)}`;
  }
  if (fact.type === 'date') return formatFactDate(fact.value);
  return fact.value;
}
