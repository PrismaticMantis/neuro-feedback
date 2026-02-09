/**
 * Session Summary PDF generation.
 *
 * Captures a live DOM node as a high-fidelity image and embeds it in a
 * single-page A4 PDF.  Uses `html2canvas` (direct canvas rendering — no
 * SVG foreignObject) + `jsPDF`.
 *
 * html2canvas is used instead of html-to-image because the latter relies
 * on SVG foreignObject which fails on Safari / iOS WebKit (backdrop-filter,
 * gradients, and canvas size limits all break).
 *
 * Also exports `deriveRecoveryPoints` (pure utility, used elsewhere).
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ── Debug flag ────────────────────────────────────────────────────────────
const DEBUG_PDF = true;

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

/** Detect iOS / iPadOS Safari (or Bluefy which uses WKWebView) */
function isIOSWebKit(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Capture a DOM node as a canvas image and embed it in a single-page
 * A4 PDF.  The image is scaled to fit within the page margins while
 * maintaining its aspect ratio.
 *
 * @param node  The DOM element to capture (the summary screen root).
 * @returns     A PDF Blob ready for download / share / email attachment.
 */
export async function exportSummarySnapshotPdf(node: HTMLElement): Promise<Blob> {
  if (DEBUG_PDF) {
    console.log('[PDF] ── export start ──');
    console.log('[PDF] userAgent:', navigator.userAgent);
    console.log('[PDF] platform:', navigator.platform);
    console.log('[PDF] isIOSWebKit:', isIOSWebKit());
    console.log('[PDF] devicePixelRatio:', window.devicePixelRatio);
    console.log('[PDF] node dimensions:', node.scrollWidth, '×', node.scrollHeight);
    console.log('[PDF] document.fonts.status:', document.fonts?.status);
  }

  // ── 0. Wait for fonts & next paint ──────────────────────────────────
  try {
    await document.fonts.ready;
  } catch {
    // fonts API not available — continue anyway
  }
  await new Promise<void>(r => requestAnimationFrame(() => r()));

  // ── 1. Choose a safe pixel ratio ────────────────────────────────────
  // iOS Safari has a hard canvas pixel limit (~16.7 million px).
  // At DPR 2 a typical summary (800×1400) → 1600×2800 = 4.5M px which
  // is usually fine, but to be safe on older devices cap at 1.5 on iOS.
  const maxScale = isIOSWebKit() ? 1.5 : 2;
  const scale = Math.min(window.devicePixelRatio || 1, maxScale);

  if (DEBUG_PDF) {
    console.log('[PDF] chosen scale:', scale);
    const estPixels = node.scrollWidth * scale * node.scrollHeight * scale;
    console.log('[PDF] estimated canvas pixels:', estPixels.toLocaleString());
  }

  // ── 2. Temporarily mark body for capture (disable problematic CSS) ──
  document.body.classList.add('pdf-capture');

  let canvas: HTMLCanvasElement;
  try {
    // ── 3. Render DOM to canvas via html2canvas ───────────────────────
    canvas = await html2canvas(node, {
      backgroundColor: '#0c0a0e', // bg.primary — no white/transparent bleed
      scale,
      useCORS: true,
      allowTaint: false,
      logging: DEBUG_PDF,
      // Capture full scroll area
      width: node.scrollWidth,
      height: node.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      // Ignore elements marked with data-export-ignore
      ignoreElements: (el: Element) => {
        return el instanceof HTMLElement && el.dataset.exportIgnore !== undefined;
      },
      // Prevent html2canvas from scrolling the window
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });
  } finally {
    document.body.classList.remove('pdf-capture');
  }

  if (DEBUG_PDF) {
    console.log('[PDF] canvas created:', canvas.width, '×', canvas.height);
  }

  // ── 4. Convert canvas → Blob (cheaper than toDataURL on iOS) ────────
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('canvas.toBlob returned null'));
        }
      },
      'image/png',
    );
  });

  if (DEBUG_PDF) {
    console.log('[PDF] PNG blob size:', (pngBlob.size / 1024).toFixed(1), 'KB');
  }

  // ── 5. Build a data URL from the blob for jsPDF.addImage ────────────
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(pngBlob);
  });

  // ── 6. Build the PDF ────────────────────────────────────────────────
  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;

  const usableW = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const usableH = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;

  // Scale to fit within the usable area, preserving aspect ratio.
  const aspect = imgWidthPx / imgHeightPx;
  let pdfImgW = usableW;
  let pdfImgH = pdfImgW / aspect;

  if (pdfImgH > usableH) {
    pdfImgH = usableH;
    pdfImgW = pdfImgH * aspect;
  }

  // Center horizontally on the page.
  const xOffset = (A4_WIDTH_MM - pdfImgW) / 2;
  const yOffset = PAGE_MARGIN_MM;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Fill entire page with dark bg so there's no white border.
  doc.setFillColor(12, 10, 14); // #0c0a0e
  doc.rect(0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, 'F');

  // Place the captured image.
  doc.addImage(dataUrl, 'PNG', xOffset, yOffset, pdfImgW, pdfImgH);

  const pdfBlob = doc.output('blob');

  if (DEBUG_PDF) {
    console.log('[PDF] PDF blob size:', (pdfBlob.size / 1024).toFixed(1), 'KB');
    console.log('[PDF] ── export done ──');
  }

  return pdfBlob;
}
