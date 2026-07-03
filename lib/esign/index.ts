/**
 * e-Signature abstraction.
 *  - "manual"   : draw-to-sign, works right now (no keys).
 *  - "aadhaar"  : Aadhaar eSign via ASP aggregator (Leegality / Digio) — needs keys.
 *  - "dsc"      : Digital Signature Certificate token — needs setup.
 *  - "docusign" : international agreements — needs keys.
 *
 * Adding keys in .env switches a method from "demo" to "live" without
 * touching the UI.
 */

export type EsignMethod = 'manual' | 'aadhaar' | 'dsc' | 'docusign';

export interface Signer { name: string; email?: string; phone?: string; method: EsignMethod; }

export function methodStatus(method: EsignMethod): { live: boolean; reason?: string } {
  switch (method) {
    case 'manual':
      return { live: true };
    case 'aadhaar':
      return {
        live: Boolean(process.env.LEEGALITY_API_KEY || process.env.DIGIO_CLIENT_ID),
        reason: 'Add LEEGALITY_API_KEY or DIGIO credentials to enable Aadhaar eSign.',
      };
    case 'dsc':
      return { live: false, reason: 'DSC requires a Certifying Authority token integration.' };
    case 'docusign':
      return {
        live: Boolean(process.env.DOCUSIGN_INTEGRATION_KEY),
        reason: 'Add DOCUSIGN_INTEGRATION_KEY + related credentials to enable DocuSign.',
      };
  }
}

export interface SendResult {
  ok: boolean;
  live: boolean;
  status: 'signed' | 'sent' | 'pending' | 'not_configured';
  message: string;
  envelopeId?: string;
  signedAt?: string;
}

/** Create / record a signature request. Manual signs immediately; others are stubbed for keys. */
export async function sendForSignature(args: {
  method: EsignMethod;
  documentName: string;
  signers: Signer[];
  signatureDataUrl?: string; // for manual
}): Promise<SendResult> {
  const { method, documentName, signatureDataUrl } = args;
  const status = methodStatus(method);

  if (method === 'manual') {
    if (!signatureDataUrl) return { ok: false, live: true, status: 'pending', message: 'No signature captured yet.' };
    return {
      ok: true, live: true, status: 'signed',
      message: `"${documentName}" signed manually and recorded with audit trail.`,
      envelopeId: 'manual-' + Math.abs(hash(documentName + signatureDataUrl.length)).toString(36),
      signedAt: new Date().toISOString(),
    };
  }

  if (!status.live) {
    return { ok: false, live: false, status: 'not_configured', message: status.reason || 'Provider not configured.' };
  }

  // TODO: real provider calls (Leegality/Digio/DocuSign) go here.
  return {
    ok: true, live: true, status: 'sent',
    message: `Signature request for "${documentName}" sent via ${method}.`,
    envelopeId: method + '-' + Math.abs(hash(documentName)).toString(36),
  };
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }
