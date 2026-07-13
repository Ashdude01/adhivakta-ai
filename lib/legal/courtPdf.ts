import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Renders a draft as a court-ready A4 PDF.
 *
 * Matches the DOCX export: A4, Times Roman, 1.5 line spacing, a wide left
 * margin for binding, ALL-CAPS lines centred as headings, everything else
 * justified. pdf-lib has no layout engine, so wrapping, justification and
 * pagination are done here by hand — which is also what lets the output line up
 * exactly with the Word version an advocate might file alongside it.
 */

// A4 in PDF points (72pt = 1 inch).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const MARGIN_RIGHT = 72;
const MARGIN_LEFT = 100;       // wider, for the binding punch
const FONT_SIZE = 12;
const LINE_HEIGHT = FONT_SIZE * 1.5;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

const CLAIM_RE = /\[\[([^\]]+)\]\]/g;

/**
 * pdf-lib's built-in fonts use WinAnsi (CP1252), which cannot encode the rupee
 * sign, smart quotes, or any Devanagari — passing them to drawText throws. Map
 * the characters a legal draft actually emits to safe equivalents, and drop
 * anything still outside Latin-1 so the PDF never crashes.
 *
 * Note: this means a Hindi/Marathi draft loses its script in the PDF; DOCX
 * export (which embeds Unicode) is the correct path for those until a Unicode
 * font is embedded here.
 */
export function winAnsiSafe(text: string): string {
  return text
    .replace(/₹/g, 'Rs. ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/[^\x00-\xFF]/g, '');
}

export async function courtPdf(title: string, body: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Strip the [[...]] citation markers — they are a UI affordance, not text the
  // court should see — then make every character encodable by the built-in font.
  const clean = winAnsiSafe(body.replace(CLAIM_RE, '$1'));

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN_TOP; };

  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();

    // A short ALL-CAPS line reads as a heading — centre it, don't justify.
    const isHeading = trimmed.length > 0 && trimmed.length < 80
      && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    const lineFont = isHeading ? bold : font;

    if (trimmed === '') { y -= LINE_HEIGHT; continue; }

    const wrapped = wrap(trimmed, lineFont, FONT_SIZE, CONTENT_W);
    wrapped.forEach((seg, i) => {
      if (y < MARGIN_BOTTOM) newPage();
      const isLastOfParagraph = i === wrapped.length - 1;
      if (isHeading) {
        const w = lineFont.widthOfTextAtSize(seg, FONT_SIZE);
        drawPlain(page, seg, MARGIN_LEFT + (CONTENT_W - w) / 2, y, lineFont);
      } else if (isLastOfParagraph) {
        drawPlain(page, seg, MARGIN_LEFT, y, lineFont);   // ragged last line
      } else {
        drawJustified(page, seg, y, lineFont);
      }
      y -= LINE_HEIGHT;
    });
  }

  // Page numbers, centred in the bottom margin.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1}`;
    const w = font.widthOfTextAtSize(label, 10);
    p.drawText(label, { x: (PAGE_W - w) / 2, y: MARGIN_BOTTOM / 2, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  });

  return doc.save();
}

function drawPlain(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text, { x, y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
}

/** Justify by distributing the slack evenly across the gaps between words. */
function drawJustified(page: PDFPage, text: string, y: number, font: PDFFont) {
  const words = text.split(' ').filter(Boolean);
  if (words.length < 2) { drawPlain(page, text, MARGIN_LEFT, y, font); return; }

  const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, FONT_SIZE), 0);
  const gap = (CONTENT_W - wordsWidth) / (words.length - 1);
  // A gap this wide means one very long word overflowed the measure; fall back
  // to a normal single space rather than scattering the words across the page.
  const spacing = gap > FONT_SIZE * 3 ? font.widthOfTextAtSize(' ', FONT_SIZE) : gap;

  let x = MARGIN_LEFT;
  for (const word of words) {
    drawPlain(page, word, x, y, font);
    x += font.widthOfTextAtSize(word, FONT_SIZE) + spacing;
  }
}

/** Greedy word wrap to a pixel width, breaking any word longer than the line. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      // A single token (a URL, a long section string) that will not fit — hard
      // break it character by character so nothing runs off the page edge.
      let chunk = '';
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) { lines.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
