import { z } from 'zod';
import { PARTY_ROLES, MATTER_TYPES, factsSchemaFor } from '@/lib/legal/matterTypes';
import { blank } from '@/lib/validation/zod';

/**
 * Wire schemas for matter intake. Shared by the API routes and the intake form,
 * so the client and the server disagree about a field exactly never.
 */

const optionalText = (max: number) => blank(z.string().trim().max(max));
const isoDate = blank(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date'));

export const contactInputSchema = z.object({
  full_name: z.string().trim().min(2, 'Every party needs a name').max(200),
  entity_type: z.enum(['individual', 'company', 'partnership', 'proprietorship', 'huf', 'trust', 'society', 'government']).default('individual'),
  salutation: optionalText(20),
  aka_names: z.array(z.string().trim().min(1).max(200)).max(10).optional(),

  age: blank(z.coerce.number().int().min(1).max(129)),
  gender: blank(z.enum(['male', 'female', 'other'])),
  relation_type: blank(z.enum(['s/o', 'd/o', 'w/o', 'h/o', 'c/o'])),
  relation_name: optionalText(200),
  occupation: optionalText(120),

  address_line: optionalText(300),
  village_town: optionalText(120),
  taluka: optionalText(120),
  district: optionalText(120),
  state: optionalText(120),
  pincode: blank(z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits')),

  mobile: blank(z.string().trim().regex(/^[+]?[0-9 -]{6,16}$/, 'Enter a valid phone number')),
  email: blank(z.string().trim().email('Enter a valid email').max(200)),

  pan: blank(z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN looks like ABCDE1234F'))),
  // Full Aadhaar is deliberately not accepted: under the DPDP Act we keep only
  // what is needed to recognise a document the advocate already holds.
  aadhaar_last4: blank(z.string().regex(/^[0-9]{4}$/, 'Enter only the last 4 digits of the Aadhaar')),

  is_minor: z.boolean().optional(),
  is_unsound_mind: z.boolean().optional(),
  guardian_contact_id: blank(z.string().uuid()),
  notes: optionalText(2000),
});

export type ContactInputPayload = z.infer<typeof contactInputSchema>;

/** A party either references a saved contact or carries the fields to create one. */
export const partyInputSchema = z.object({
  contact: z.union([
    z.object({ id: z.string().uuid() }),
    contactInputSchema,
  ]),
  role: z.enum(PARTY_ROLES as unknown as [string, ...string[]]),
  side: z.enum(['client', 'opposite', 'other']),
  party_no: blank(z.coerce.number().int().min(1).max(99)),
  advocate_name: optionalText(200),
  address_for_service: optionalText(400),
});

const matterTypeCodes = MATTER_TYPES.map((t) => t.code) as [string, ...string[]];

/** Columns an advocate can set. `facts` is validated separately, per type. */
const matterColumnsSchema = z.object({
  title: z.string().trim().min(2, 'Give the matter a title').max(160),
  matter_type_code: z.enum(matterTypeCodes),
  matter_type: optionalText(80),
  practice_area: optionalText(80),
  client_ref: optionalText(60),
  code: optionalText(8),
  subtitle: optionalText(200),
  description: optionalText(2000),
  status: optionalText(40),
  tag: optionalText(40),
  tag_class: optionalText(40),
  color: optionalText(40),

  relief_sought: optionalText(1000),
  suit_value: blank(z.coerce.number().nonnegative().max(1e13)),

  court: optionalText(120),
  court_complex: optionalText(160),
  district: optionalText(120),
  state: optionalText(120),

  cnr: blank(z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{4}[0-9]{12}$/, 'A CNR is 4 letters followed by 12 digits'))),
  case_type: optionalText(80),
  case_number: optionalText(40),
  case_year: blank(z.coerce.number().int().min(1900).max(2200)),
  filing_number: optionalText(60),
  act: optionalText(160),
  section: optionalText(60),
  filed_on: isoDate,
  next_hearing_date: isoDate,
});

export const matterCreateSchema = matterColumnsSchema.extend({
  facts: z.record(z.unknown()).optional(),
  parties: z.array(partyInputSchema).max(40).optional(),
});

export const matterUpdateSchema = matterColumnsSchema.partial().extend({
  facts: z.record(z.unknown()).optional(),
});

/**
 * Validates `facts` against the schema its matter type declares. Kept out of the
 * matter schema itself because the type code has to be known first.
 */
export function parseFacts(matterTypeCode: string | null | undefined, facts: unknown): Record<string, unknown> {
  if (!facts || typeof facts !== 'object') return {};
  return factsSchemaFor(matterTypeCode).parse(facts);
}

export const conflictCheckSchema = z.object({
  names: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
});
