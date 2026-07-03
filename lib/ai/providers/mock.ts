import { ChatMessage, CompleteOptions } from '../types';

/**
 * MOCK provider — makes the whole app usable with ZERO API keys.
 *  - Drafting: fills a real Indian-format template from the intake fields.
 *  - Chat/Review: lightweight keyword retrieval over the document context,
 *    so "review + chat" genuinely works offline (no LLM needed).
 */
export function mockComplete(messages: ChatMessage[], opts?: CompleteOptions): string {
  const intent = opts?.intent || 'generic';
  if (intent === 'draft') return mockDraft(opts?.payload || {});
  if (intent === 'chat') return mockChat(opts?.payload || {}, messages);
  if (intent === 'review') return mockReview(opts?.payload || {});
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return `**[Offline demo mode]** I received: "${(last?.content || '').slice(0, 160)}".\n\nAdd a free AI key (Gemini/Groq) in your .env to get full AI responses.`;
}

function inr(v: string) { return v?.toString().trim() || '_____'; }

function mockDraft(p: any): string {
  const type = (p.docType || '').toLowerCase();
  const client = inr(p.client);
  const opposite = inr(p.opposite);
  const amount = inr(p.amount);
  const dates = inr(p.dates);

  if (type.includes('138') || type.includes('cheque') || type.includes('notice')) {
    return `LEGAL NOTICE
Under Section 138 of the Negotiable Instruments Act, 1881

To,
${opposite}

Dear Sir,

Under instructions from and on behalf of my client ${client}, I do hereby serve upon you the following legal notice:

1. That you issued a cheque for a sum of ₹${amount}/- in discharge of a legally enforceable debt/liability owed to my client.

2. That the said cheque, on presentation, was returned dishonoured with the remark "Funds Insufficient" (cheque/bounce particulars: ${dates}).

3. That as held in [[Dashrath Rupsingh Rathod v. State of Maharashtra (2014)]], the cause of action arises within the jurisdiction where the cheque is presented, and you are liable under [[Section 138 of the NI Act, 1881]].

4. You are hereby called upon to pay the said sum of ₹${amount}/- within FIFTEEN (15) DAYS of receipt hereof, failing which my client shall be constrained to initiate criminal proceedings under Section 138 of the NI Act, 1881, entirely at your risk, cost and consequences.

Yours faithfully,
Advocate for ${client}

— Generated in offline demo mode. Add a free Gemini/Groq key for fully AI-written, fact-checked drafts. —`;
  }

  return `DRAFT — ${inr(p.docType)}

On behalf of ${client} against ${opposite} (amount: ₹${amount}; dates: ${dates}).

[This is an offline demo template. Connect a free AI model in .env to generate a complete, citation-grounded draft for any document type.]`;
}

function mockReview(payload: any): string {
  const text: string = (payload?.context || '').trim();
  if (!text) return `**[Offline demo]** No document text provided to review.`;
  const words = text.split(/\s+/).length;
  const sentences = text.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 15);
  const lead = sentences.slice(0, 3).map((s) => `• ${s.trim()}`).join('\n');
  // flag likely-important legal keywords
  const flags: string[] = [];
  const checks: [RegExp, string][] = [
    [/limitation|barred|time-barred/i, 'Possible limitation / time-bar issue'],
    [/jurisdiction/i, 'Jurisdiction reference found'],
    [/without prejudice/i, '"Without prejudice" clause present'],
    [/settlement|full and final/i, 'Settlement / full-and-final language'],
    [/security|advance/i, 'Cheque-as-security / advance defence'],
  ];
  checks.forEach(([re, label]) => { if (re.test(text)) flags.push(label); });

  return `Document reviewed in offline demo mode.

Overview (~${words} words, ${sentences.length} sentences). Key opening points:
${lead}

Flags detected:
${flags.length ? flags.map((f) => `⚠ ${f}`).join('\n') : '— none auto-detected —'}

Ask a question in the chat to dig deeper. Add a free AI key (Gemini/Groq) in .env for full summaries, timelines and verified citations.`;
}

function mockChat(payload: any, messages: ChatMessage[]): string {
  const context: string = payload?.context || '';
  const question: string = payload?.question
    || [...messages].reverse().find((m) => m.role === 'user')?.content
    || '';

  if (!context) {
    return `**[Offline demo]** Upload or open a document and I'll answer from it. Add a free AI key for deeper reasoning.`;
  }

  // naive sentence retrieval: rank sentences by keyword overlap with the question
  const stop = new Set(['the','a','an','is','are','of','to','in','and','what','their','this','that','for','on','was','were']);
  const qWords = question.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
  const sentences = context.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 20);
  const ranked = sentences
    .map((s) => {
      const sl = s.toLowerCase();
      const score = qWords.reduce((acc, w) => acc + (sl.includes(w) ? 1 : 0), 0);
      return { s, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return `I scanned the document but couldn't find a passage directly matching "${question}". Try rephrasing, or add a free AI key for semantic understanding.`;
  }

  const findings = ranked.map((r, i) => `${i + 1}. "${r.s.trim()}"`).join('\n');
  return `Based on the document, here is what's most relevant to your question:\n\n${findings}\n\n[Offline keyword match — connect a free AI model in .env for full reasoning, summaries and verified citations.]`;
}
