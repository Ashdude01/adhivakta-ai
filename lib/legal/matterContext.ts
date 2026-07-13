import 'server-only';
import { getMatterFull } from '@/lib/data/matters';
import { getMatterType, labelledFacts, formatAmount, formatFactValue } from '@/lib/legal/matterTypes';
import { groupByRole, renderCauseTitle } from '@/lib/legal/causeTitle';
import type { MatterFull } from '@/lib/supabase/types';

/**
 * The matter → AI bridge.
 *
 * This is the whole point of making the matter the base entity: the advocate
 * enters the parties and facts once, at intake, and every later action — draft,
 * review, chat, e-sign — reads them from here instead of asking again. Anything
 * the model is told about a matter must come through this function, so there is
 * exactly one place where "what the AI knows" is defined.
 */

export interface MatterContext {
  matter: MatterFull;
  causeTitle: string;
  /** Ready to paste into a system/user prompt. Empty string when there is no matter. */
  promptBlock: string;
}

export async function buildMatterContext(userId: string, matterId: string): Promise<MatterContext | null> {
  const matter = await getMatterFull(userId, matterId);
  if (!matter) return null;
  return {
    matter,
    causeTitle: renderCauseTitle(matter.parties_list),
    promptBlock: renderPromptBlock(matter),
  };
}

function renderPromptBlock(matter: MatterFull): string {
  const type = getMatterType(matter.matter_type_code);
  const lines: string[] = ['### MATTER CONTEXT'];
  lines.push(
    'These are the verified particulars of this matter. Use them exactly as given. ' +
    'Do not invent a party, date, amount or address that is not listed here. ' +
    'If a particular you need is missing, write it as a clearly marked blank such as [DATE OF SERVICE] rather than guessing.',
    '',
  );

  lines.push(`Matter: ${matter.title}`);
  if (type) {
    const statute = [type.act, type.section && `s.${type.section}`].filter(Boolean).join(', ');
    lines.push(`Type: ${type.label}${statute ? ` (${statute})` : ''}`);
  }

  const forum = [matter.court, matter.court_complex, matter.district, matter.state].filter(Boolean).join(', ');
  if (forum) lines.push(`Court / forum: ${forum}`);

  const caseRef = [
    matter.cnr && `CNR ${matter.cnr}`,
    matter.case_number && `${matter.case_type ?? 'Case'} No. ${matter.case_number}${matter.case_year ? `/${matter.case_year}` : ''}`,
    matter.filing_number && `Filing No. ${matter.filing_number}`,
    matter.next_hearing_date && `Next hearing ${matter.next_hearing_date}`,
  ].filter(Boolean);
  if (caseRef.length) lines.push(`Case: ${caseRef.join(' · ')}`);

  // Parties, in cause-title order, each with the full Order VII r.1 description.
  const groups = groupByRole(matter.parties_list);
  if (groups.length) {
    lines.push('', 'PARTIES');
    for (const g of groups) {
      lines.push(`${g.roleLabel}${g.parties.length > 1 ? 's' : ''}:`);
      g.parties.forEach((p, i) => lines.push(`  ${i + 1}. ${p.description}`));
    }
  }

  const facts = labelledFacts(matter.matter_type_code, matter.facts);
  const brief = facts.find((f) => f.key === 'brief_facts');
  const rest = facts.filter((f) => f.key !== 'brief_facts');
  if (rest.length) {
    lines.push('', 'CASE FACTS');
    for (const f of rest) lines.push(`- ${f.label}: ${formatFactValue(f)}`);
  }
  if (brief) lines.push('', `Brief facts: ${brief.value}`);

  const relief = matter.relief_sought ?? undefined;
  if (relief) lines.push('', `Relief sought: ${relief}`);
  if (matter.suit_value != null) lines.push(`Suit valuation: ₹${formatAmount(matter.suit_value)}`);
  if (matter.description) lines.push('', `Advocate's notes: ${matter.description}`);

  lines.push('### END MATTER CONTEXT');
  return lines.join('\n');
}

/**
 * Values for the drafting form's legacy party/amount/date inputs, so selecting a
 * matter fills them instead of the advocate retyping what intake already knows.
 */
export interface DraftPrefill {
  client: string;
  opposite: string;
  amount: string;
  dates: string;
}

export function draftPrefill(matter: MatterFull): DraftPrefill {
  const groups = groupByRole(matter.parties_list);
  const names = (side: string) =>
    groups.filter((g) => g.side === side)
      .flatMap((g) => g.parties.map((p) => p.contact.full_name))
      .join(', ');

  const type = getMatterType(matter.matter_type_code);
  const amountField = type?.facts.find((f) => f.type === 'amount' && matter.facts?.[f.key] != null);
  const amount = amountField
    ? formatAmount(Number(matter.facts[amountField.key]))
    : matter.suit_value != null ? formatAmount(matter.suit_value) : '';

  const dates = labelledFacts(matter.matter_type_code, matter.facts)
    .filter((f) => f.type === 'date')
    .map((f) => `${f.label}: ${formatFactValue(f)}`)
    .join(' / ');

  return { client: names('client'), opposite: names('opposite'), amount, dates };
}
