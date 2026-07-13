import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { winAnsiSafe } from '@/lib/legal/courtPdf';

/**
 * Affixes a simple electronic signature to a PDF.
 *
 * This is an *affixed* signature — the drawn or typed mark, the signer's name,
 * place and time, stamped onto the document and sealed with a hash of the file.
 * It is NOT a Digital Signature Certificate or an Aadhaar eSign: those bind a
 * legal identity to the document and are what a court e-filing requires. This is
 * the everyday signature an advocate puts on a notice or letter, made verifiable
 * by recording exactly what was signed and when.
 */

export interface AffixInput {
  signerName: string;
  designation?: string;
  place?: string;
  /** A PNG data URL from the signature pad, or an uploaded signature image. */
  imageDataUrl?: string;
  /** Used when the signer types their name instead of drawing. */
  typedName?: string;
  signedAt?: Date;
}

export interface SignedPdf {
  bytes: Uint8Array;
  /** SHA-256 of the ORIGINAL document — the tamper anchor printed on the page. */
  sourceHash: string;
  signedAt: string;
}

export async function affixSignature(source: Uint8Array, input: AffixInput): Promise<SignedPdf> {
  const sourceHash = createHash('sha256').update(source).digest('hex');
  const signedAt = input.signedAt ?? new Date();

  const doc = await PDFDocument.load(source);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  const { width } = page.getSize();

  // A panel at the foot of the last page. Right-aligned block, above the page
  // number that courtPdf prints in the bottom margin.
  const panelW = 240;
  const right = width - 72;
  const left = right - panelW;
  let y = 150;

  page.drawLine({ start: { x: left, y: y + 46 }, end: { x: right, y: y + 46 }, thickness: 0.75, color: rgb(0.6, 0.6, 0.6) });

  // The mark: the drawn image, or the typed name in a script-like italic.
  if (input.imageDataUrl) {
    try {
      const png = await doc.embedPng(dataUrlToBytes(input.imageDataUrl));
      const scaled = png.scaleToFit(panelW, 42);
      page.drawImage(png, { x: left, y: y + 48, width: scaled.width, height: scaled.height });
    } catch {
      // A bad image should not sink the signing — fall back to the typed name.
      drawTyped(page, italic, input.typedName || input.signerName, left, y + 54);
    }
  } else {
    drawTyped(page, italic, input.typedName || input.signerName, left, y + 54);
  }

  const lines = [
    { t: winAnsiSafe(input.signerName), f: bold, s: 11 },
    input.designation ? { t: winAnsiSafe(input.designation), f: font, s: 10 } : null,
    { t: winAnsiSafe(`Place: ${input.place || '-'}`), f: font, s: 9.5 },
    { t: `Date: ${signedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, f: font, s: 9.5 },
  ].filter(Boolean) as Array<{ t: string; f: typeof font; s: number }>;

  for (const l of lines) {
    page.drawText(l.t, { x: left, y, size: l.s, font: l.f, color: rgb(0, 0, 0) });
    y -= l.s + 3;
  }

  // Provenance strip: how it was signed and the anchor to detect tampering.
  page.drawText('Electronically signed via Erolt AI', { x: left, y, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
  y -= 10;
  page.drawText(`Doc SHA-256: ${sourceHash.slice(0, 32)}…`, { x: left, y, size: 7, font, color: rgb(0.45, 0.45, 0.45) });

  const bytes = await doc.save();
  return { bytes, sourceHash, signedAt: signedAt.toISOString() };
}

function drawTyped(page: PDFPage, font: PDFFont, text: string, x: number, y: number) {
  page.drawText(text, { x, y, size: 20, font, color: rgb(0.06, 0.06, 0.35) });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
