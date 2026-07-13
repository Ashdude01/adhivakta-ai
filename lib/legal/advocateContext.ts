import 'server-only';
import { getUserById } from '@/lib/data/users';
import { letterheadText, missingForNotice, type Advocate } from '@/lib/legal/letterhead';

/**
 * The advocate's letterhead as the AI sees it.
 *
 * A notice is issued under the advocate's own particulars, so the model is
 * handed them verbatim and told not to alter them — the same letterhead the
 * profile screen previews. Returned separately from the matter context because
 * it is the *sender's* authority, constant across every matter.
 */
export interface AdvocateContext {
  advocate: Advocate;
  letterhead: string;
  promptBlock: string;
  /** Letterhead fields a valid notice still needs. */
  missing: string[];
}

export async function buildAdvocateContext(userId: string): Promise<AdvocateContext | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  const advocate: Advocate = {
    name: user.name,
    designation: user.designation,
    firm_name: user.firm_name,
    enrolment_no: user.enrolment_no,
    bar_council: user.bar_council,
    office_address: user.office_address,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    phone: user.phone,
    alt_phone: user.alt_phone,
    email: user.email,
  };

  const letterhead = letterheadText(advocate);
  const missing = missingForNotice(advocate);

  const lines = ['### ADVOCATE LETTERHEAD'];
  if (letterhead) {
    lines.push(
      'Issue the document under these particulars exactly as written. Do not invent, complete or alter any of them:',
      '',
      letterhead,
    );
  } else {
    lines.push('The advocate has not filled their letterhead. Leave a bracketed [ADVOCATE LETTERHEAD] placeholder at the top for them to complete.');
  }
  if (missing.length) {
    lines.push('', `Missing from the letterhead — use a bracketed placeholder for each: ${missing.join(', ')}.`);
  }
  lines.push('### END ADVOCATE LETTERHEAD');

  return { advocate, letterhead, promptBlock: lines.join('\n'), missing };
}
