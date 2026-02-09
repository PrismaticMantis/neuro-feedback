/**
 * Session Summary PDF generation.
 *
 * Two modes:
 *  1. **Snapshot PDF** (preferred) – captures a live DOM node as a retina image
 *     and embeds it into a single-page A4 PDF.  Uses `html-to-image` + `jsPDF`.
 *  2. **deriveRecoveryPoints** – pure utility, kept for use elsewhere.
 *
 * The old text-report `generateSummaryPdfBlob` has been removed.
 */

import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

// ── Re-exported utility (used by App.tsx, SessionDetail.tsx) ──────────────

/** Derive recovery points (6–15) from coherence and stability. */
export function deriveRecoveryPoints(coherencePercent: number, stability: string): number {
  const stabilityScore = stability === 'High' ? 4 : stability === 'Medium' ? 2 : 0;
  const coherenceTier = coherencePercent >= 70 ? 5 : coherencePercent >= 50 ? 3 : coherencePercent >= 30 ? 2 : 1;
  const raw = 6 + stabilityScore + coherenceTier;
  return Math.min(15, Math.max(6, raw));
}

// ── Snapshot PDF ──────────────────────────────────────────────────────────

/** A4 dimensions in mm */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Margin inside the page (mm) */
const PAGE_MARGIN_MM = 10;

/**
 * Capture a DOM node as a high-fidelity PNG and embed it in a single-page
 * A4 PDF.  The image is scaled to fit within the page margins while
 * maintaining its aspect ratio.
 *
 * @param node  The DOM element to capture (the summary screen root).
 * @returns     A PDF Blob ready for download / share / email attachment.
 */
export async function exportSummarySnapshotPdf(node: HTMLElement): Promise<Blob> {
  // ── 1. Capture the DOM as a retina PNG ──────────────────────────────
  const pixelRatio = Math.min(window.devicePixelRatio || 2, 3); // cap at 3×

  const dataUrl = await toPng(node, {
    // Dark background – must match the app's main bg so there's no
    // white/transparent bleed.
    backgroundColor: '#0c0a0e', // bg.primary from design tokens
    pixelRatio,
    // Ensure full scroll height is captured, not clipped to viewport.
    height: node.scrollHeight,
    width: node.scrollWidth,
    // Skip elements marked data-export-ignore (e.g. share buttons)
    filter: (domNode: Node) => {
      if (domNode instanceof HTMLElement && domNode.dataset.exportIgnore !== undefined) {
        return false;
      }
      return true;
    },
    // Cache-bust external images (fonts are usually inlined by html-to-image)
    cacheBust: true,
  });

  // ── 2. Load the image to read its natural dimensions ────────────────
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load captured image'));
    img.src = dataUrl;
  });

  const imgWidthPx = img.naturalWidth;
  const imgHeightPx = img.naturalHeight;

  // ── 3. Build the PDF ────────────────────────────────────────────────
  const usableW = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const usableH = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;

  // Scale to fit within the usable area, preserving aspect ratio.
  const aspect = imgWidthPx / imgHeightPx;
  let pdfImgW = usableW;
  let pdfImgH = pdfImgW / aspect;

  if (pdfImgH > usableH) {
    // Image is taller than one page – scale down to fit.
    pdfImgH = usableH;
    pdfImgW = pdfImgH * aspect;
  }

  // Center horizontally on the page.
  const xOffset = (A4_WIDTH_MM - pdfImgW) / 2;
  const yOffset = PAGE_MARGIN_MM;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Fill the entire page with the dark bg so there's no white border.
  doc.setFillColor(12, 10, 14); // #0c0a0e
  doc.rect(0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, 'F');

  // Place the captured image.
  doc.addImage(dataUrl, 'PNG', xOffset, yOffset, pdfImgW, pdfImgH);

  return doc.output('blob');
}
