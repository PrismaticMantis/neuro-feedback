/**
 * Session Summary PDF generation.
 *
 * Two paths:
 *  1. **Snapshot PDF** (primary) – captures the live Summary DOM via
 *     `html2canvas` + `jsPDF`.  High-fidelity visual clone.
 *  2. **Fallback PDF** – pure jsPDF text layout with the same session
 *     data.  Used automatically if the snapshot path throws (e.g. iOS
 *     canvas limits, WebKit rendering bugs).
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

// ── Types ─────────────────────────────────────────────────────────────────

/** Data needed by the fallback text PDF (passed from SessionSummary). */
export interface FallbackPdfData {
  userName: string;
  journeyName: string;
  sessionDate: string;        // e.g. "Jan 27, 2026 8:14 PM"
  durationFormatted: string;  // e.g. "12:30 min"
  coherencePercent: number;
  peakCoherence: number;      // 0-1
  stability: string;          // "High" | "Medium" | "Low"
  avgHeartRate: number | null;
  avgHRV: number | null;
  recoveryPoints: number;
  longestStreakFormatted: string;
  interpretation: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** A4 dimensions in mm */
const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;

// Lovable palette (dark theme)
const BG = { r: 12, g: 10, b: 14 };           // #0c0a0e
const GOLD = { r: 217, g: 196, b: 120 };       // #D9C478
const TEXT_PRI = { r: 247, g: 244, b: 236 };   // #f7f4ec
const TEXT_MUT = { r: 158, g: 149, b: 163 };   // #9e95a3
const TEXT_SUB = { r: 110, g: 104, b: 114 };   // #6e6872
const CARD_BG = { r: 28, g: 26, b: 31 };       // #1c1a1f

/** Detect iOS / iPadOS Safari (or Bluefy which uses WKWebView) */
function isIOSWebKit(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ── Snapshot PDF (primary) ────────────────────────────────────────────────

async function captureSnapshotPdf(node: HTMLElement): Promise<Blob> {
  if (DEBUG_PDF) {
    console.log('[PDF] ── snapshot start ──');
    console.log('[PDF] userAgent:', navigator.userAgent);
    console.log('[PDF] platform:', navigator.platform);
    console.log('[PDF] isIOSWebKit:', isIOSWebKit());
    console.log('[PDF] devicePixelRatio:', window.devicePixelRatio);
    console.log('[PDF] node dimensions:', node.scrollWidth, '×', node.scrollHeight);
    console.log('[PDF] document.fonts.status:', document.fonts?.status);
  }

  // Wait for fonts & next paint
  try { await document.fonts.ready; } catch { /* noop */ }
  await new Promise<void>(r => requestAnimationFrame(() => r()));

  // Safe pixel ratio (iOS canvas limit ~16.7 M px)
  const maxScale = isIOSWebKit() ? 1.5 : 2;
  const scale = Math.min(window.devicePixelRatio || 1, maxScale);

  if (DEBUG_PDF) {
    console.log('[PDF] chosen scale:', scale);
    const est = node.scrollWidth * scale * node.scrollHeight * scale;
    console.log('[PDF] estimated canvas pixels:', est.toLocaleString());
  }

  // Temporarily disable problematic CSS
  document.body.classList.add('pdf-capture');

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, {
      backgroundColor: '#0c0a0e',
      scale,
      useCORS: true,
      allowTaint: false,
      logging: DEBUG_PDF,
      width: node.scrollWidth,
      height: node.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (el: Element) =>
        el instanceof HTMLElement && el.dataset.exportIgnore !== undefined,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });
  } finally {
    document.body.classList.remove('pdf-capture');
  }

  if (DEBUG_PDF) console.log('[PDF] canvas created:', canvas.width, '×', canvas.height);

  // canvas → Blob (avoids giant data-URL on iOS)
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });

  if (DEBUG_PDF) console.log('[PDF] PNG blob size:', (pngBlob.size / 1024).toFixed(1), 'KB');

  // Blob → data URL for jsPDF
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(pngBlob);
  });

  // Build PDF
  const usableW = A4_W - MARGIN * 2;
  const usableH = A4_H - MARGIN * 2;
  const aspect = canvas.width / canvas.height;
  let imgW = usableW;
  let imgH = imgW / aspect;
  if (imgH > usableH) { imgH = usableH; imgW = imgH * aspect; }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(0, 0, A4_W, A4_H, 'F');
  doc.addImage(dataUrl, 'PNG', (A4_W - imgW) / 2, MARGIN, imgW, imgH);

  const blob = doc.output('blob');
  if (DEBUG_PDF) {
    console.log('[PDF] PDF blob size:', (blob.size / 1024).toFixed(1), 'KB');
    console.log('[PDF] ── snapshot done ──');
  }
  return blob;
}

// ── Fallback PDF (text layout) ────────────────────────────────────────────

function generateFallbackPdf(data: FallbackPdfData): Blob {
  if (DEBUG_PDF) console.log('[PDF] ── fallback start ──');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const font = doc.getFont().fontName;

  // Dark background
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(0, 0, A4_W, A4_H, 'F');

  const cX = A4_W / 2;
  const leftM = 24;
  const rightM = A4_W - 24;
  let y = 24;

  // ── Title bar ──
  doc.setFontSize(10);
  doc.setTextColor(TEXT_MUT.r, TEXT_MUT.g, TEXT_MUT.b);
  doc.text('SoundBed Session Summary', cX, y, { align: 'center' });
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(TEXT_SUB.r, TEXT_SUB.g, TEXT_SUB.b);
  doc.text(`${data.userName}  ·  ${data.sessionDate}`, cX, y, { align: 'center' });
  y += 14;

  // ── Journey name ──
  doc.setFontSize(18);
  doc.setTextColor(TEXT_PRI.r, TEXT_PRI.g, TEXT_PRI.b);
  doc.setFont(font, 'bold');
  doc.text(data.journeyName, cX, y, { align: 'center' });
  doc.setFont(font, 'normal');
  y += 16;

  // ── Coherence circle (drawn as a ring + number) ──
  const circleY = y + 24;
  const circleR = 22;
  // Outer ring (gold)
  doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
  doc.setLineWidth(2.5);
  doc.circle(cX, circleY, circleR);
  // Coherence value
  doc.setFontSize(28);
  doc.setTextColor(TEXT_PRI.r, TEXT_PRI.g, TEXT_PRI.b);
  doc.setFont(font, 'bold');
  doc.text(`${Math.round(data.coherencePercent)}`, cX, circleY + 2, { align: 'center' });
  // "%" smaller
  doc.setFontSize(12);
  doc.text('%', cX + 16, circleY - 4, { align: 'left' });
  doc.setFont(font, 'normal');
  // Label
  doc.setFontSize(9);
  doc.setTextColor(TEXT_MUT.r, TEXT_MUT.g, TEXT_MUT.b);
  doc.text('Coherence', cX, circleY + circleR + 8, { align: 'center' });
  y = circleY + circleR + 18;

  // ── Interpretation ──
  doc.setFontSize(9);
  doc.setTextColor(TEXT_MUT.r, TEXT_MUT.g, TEXT_MUT.b);
  const interpLines = doc.splitTextToSize(data.interpretation, rightM - leftM);
  doc.text(interpLines, cX, y, { align: 'center' });
  y += interpLines.length * 5 + 10;

  // ── Metrics card ──
  const cardTop = y;
  const metrics: [string, string][] = [
    ['Duration', data.durationFormatted],
    ['Peak Coherence', `${Math.round(data.peakCoherence * 100)}%`],
    ['Longest Streak', data.longestStreakFormatted],
    ['Stability', data.stability],
    ['Avg Heart Rate', data.avgHeartRate != null ? `${Math.round(data.avgHeartRate)} bpm` : '—'],
    ['Avg HRV', data.avgHRV != null ? `${Math.round(data.avgHRV)} ms` : '—'],
    ['Recovery Points', String(data.recoveryPoints)],
  ];

  const rowH = 8;
  const cardH = metrics.length * rowH + 16; // 8px padding top/bottom

  // Card bg
  doc.setFillColor(CARD_BG.r, CARD_BG.g, CARD_BG.b);
  doc.roundedRect(leftM - 4, cardTop, (rightM - leftM) + 8, cardH, 3, 3, 'F');

  let mY = cardTop + 10;
  metrics.forEach(([label, value]) => {
    doc.setFontSize(9);
    doc.setTextColor(TEXT_MUT.r, TEXT_MUT.g, TEXT_MUT.b);
    doc.text(label, leftM, mY);
    doc.setTextColor(TEXT_PRI.r, TEXT_PRI.g, TEXT_PRI.b);
    doc.setFont(font, 'bold');
    doc.text(value, rightM, mY, { align: 'right' });
    doc.setFont(font, 'normal');
    mY += rowH;
  });

  y = cardTop + cardH + 14;

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(TEXT_SUB.r, TEXT_SUB.g, TEXT_SUB.b);
  doc.text(
    'Generated by SoundBed  ·  Your body remembers. Small shifts compound.',
    cX, A4_H - 12,
    { align: 'center' },
  );

  const blob = doc.output('blob');
  if (DEBUG_PDF) {
    console.log('[PDF] fallback PDF size:', (blob.size / 1024).toFixed(1), 'KB');
    console.log('[PDF] ── fallback done ──');
  }
  return blob;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a PDF of the Session Summary.
 *
 * Tries the high-fidelity html2canvas snapshot first.  If that fails for
 * any reason, automatically falls back to a clean text-layout PDF built
 * from `fallbackData`.  The caller never sees an error — a PDF is always
 * returned.
 *
 * @param node          The summary screen DOM element to capture.
 * @param fallbackData  Session metrics for the text-layout fallback.
 * @returns             A PDF Blob, ready for share / download.
 */
export async function exportSummarySnapshotPdf(
  node: HTMLElement | null,
  fallbackData: FallbackPdfData,
): Promise<Blob> {
  // If the DOM ref is null (component not mounted), skip straight to fallback.
  if (!node) {
    if (DEBUG_PDF) console.log('[PDF] ⚠️  node is null — using FALLBACK (text layout) path');
    return generateFallbackPdf(fallbackData);
  }

  try {
    const blob = await captureSnapshotPdf(node);
    if (DEBUG_PDF) console.log('[PDF] ✅ used PRIMARY (snapshot) path');
    return blob;
  } catch (err) {
    console.error('[PDF] Snapshot capture failed, using fallback:', err);
    if (DEBUG_PDF) console.log('[PDF] ⚠️  using FALLBACK (text layout) path');
    return generateFallbackPdf(fallbackData);
  }
}
