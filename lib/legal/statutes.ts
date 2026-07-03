// Statute registry used by the citation verifier. Deterministic — a statutory
// claim passes only if the Act is known here AND the cited section falls inside
// the Act's real section range. Canonical links point to India Code.

export interface StatuteAct {
  id: string;
  /** Full name shown to the user. */
  name: string;
  /** Alternative names/abbreviations that appear in drafts. */
  aliases: string[];
  /** Highest section number in the Act (sanity bound for cited sections). */
  maxSection: number;
  /** Canonical source page. */
  url: string;
}

export const STATUTES: StatuteAct[] = [
  {
    id: 'ni-act-1881',
    name: 'Negotiable Instruments Act, 1881',
    aliases: ['ni act', 'negotiable instruments act', 'n.i. act', 'n.i act'],
    maxSection: 148,
    url: 'https://www.indiacode.nic.in/handle/123456789/2189',
  },
  {
    id: 'ipc-1860',
    name: 'Indian Penal Code, 1860',
    aliases: ['ipc', 'indian penal code', 'penal code'],
    maxSection: 511,
    url: 'https://www.indiacode.nic.in/handle/123456789/2263',
  },
  {
    id: 'bns-2023',
    name: 'Bharatiya Nyaya Sanhita, 2023',
    aliases: ['bns', 'bharatiya nyaya sanhita'],
    maxSection: 358,
    url: 'https://www.indiacode.nic.in/handle/123456789/20062',
  },
  {
    id: 'crpc-1973',
    name: 'Code of Criminal Procedure, 1973',
    aliases: ['crpc', 'cr.p.c', 'cr.p.c.', 'code of criminal procedure', 'criminal procedure code'],
    maxSection: 484,
    url: 'https://www.indiacode.nic.in/handle/123456789/16225',
  },
  {
    id: 'bnss-2023',
    name: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
    aliases: ['bnss', 'bharatiya nagarik suraksha sanhita'],
    maxSection: 531,
    url: 'https://www.indiacode.nic.in/handle/123456789/20099',
  },
  {
    id: 'cpc-1908',
    name: 'Code of Civil Procedure, 1908',
    aliases: ['cpc', 'c.p.c', 'code of civil procedure', 'civil procedure code'],
    maxSection: 158,
    url: 'https://www.indiacode.nic.in/handle/123456789/2191',
  },
  {
    id: 'evidence-1872',
    name: 'Indian Evidence Act, 1872',
    aliases: ['evidence act', 'indian evidence act'],
    maxSection: 167,
    url: 'https://www.indiacode.nic.in/handle/123456789/2188',
  },
  {
    id: 'bsa-2023',
    name: 'Bharatiya Sakshya Adhiniyam, 2023',
    aliases: ['bsa', 'bharatiya sakshya adhiniyam'],
    maxSection: 170,
    url: 'https://www.indiacode.nic.in/handle/123456789/20063',
  },
  {
    id: 'contract-1872',
    name: 'Indian Contract Act, 1872',
    aliases: ['contract act', 'indian contract act'],
    maxSection: 238,
    url: 'https://www.indiacode.nic.in/handle/123456789/2187',
  },
  {
    id: 'consumer-2019',
    name: 'Consumer Protection Act, 2019',
    aliases: ['consumer protection act', 'cpa 2019', 'cp act'],
    maxSection: 107,
    url: 'https://www.indiacode.nic.in/handle/123456789/15256',
  },
  {
    id: 'it-act-2000',
    name: 'Information Technology Act, 2000',
    aliases: ['it act', 'information technology act'],
    maxSection: 94,
    url: 'https://www.indiacode.nic.in/handle/123456789/1999',
  },
  {
    id: 'limitation-1963',
    name: 'Limitation Act, 1963',
    aliases: ['limitation act'],
    maxSection: 32,
    url: 'https://www.indiacode.nic.in/handle/123456789/1565',
  },
  {
    id: 'mv-act-1988',
    name: 'Motor Vehicles Act, 1988',
    aliases: ['mv act', 'motor vehicles act', 'm.v. act'],
    maxSection: 217,
    url: 'https://www.indiacode.nic.in/handle/123456789/1798',
  },
  {
    id: 'tpa-1882',
    name: 'Transfer of Property Act, 1882',
    aliases: ['transfer of property act', 'tp act', 't.p. act'],
    maxSection: 137,
    url: 'https://www.indiacode.nic.in/handle/123456789/2338',
  },
  {
    id: 'sra-1963',
    name: 'Specific Relief Act, 1963',
    aliases: ['specific relief act'],
    maxSection: 44,
    url: 'https://www.indiacode.nic.in/handle/123456789/1583',
  },
  {
    id: 'arbitration-1996',
    name: 'Arbitration and Conciliation Act, 1996',
    aliases: ['arbitration act', 'arbitration and conciliation act'],
    maxSection: 86,
    url: 'https://www.indiacode.nic.in/handle/123456789/1978',
  },
];

/** Find an Act whose name/alias appears in the claim text (longest alias wins). */
export function matchAct(claim: string): StatuteAct | null {
  const lc = claim.toLowerCase();
  let best: { act: StatuteAct; len: number } | null = null;
  for (const act of STATUTES) {
    for (const alias of [act.name.toLowerCase(), ...act.aliases]) {
      if (lc.includes(alias) && (!best || alias.length > best.len)) {
        best = { act, len: alias.length };
      }
    }
  }
  return best?.act ?? null;
}
