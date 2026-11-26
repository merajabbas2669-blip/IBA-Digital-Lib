import QRCode from 'qrcode';
import { ILSSeat } from '../types/ils';

/**
 * Builds the permanent, non-sensitive application URL encoded inside an ILS desk QR code.
 * Never embeds student credentials, passwords, or PII.
 */
export function buildSeatQrPayload(qrCodeToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://iba-digital-library.local';
  return `${origin}/?scan_qr=${encodeURIComponent(qrCodeToken)}`;
}

export async function generateQrDataUrl(payload: string, width = 320): Promise<string> {
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0B1F3A',
      light: '#FFFFFF',
    },
  });
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Generates and downloads a print-ready PNG desk plaque for a single ILS seat.
 */
export async function downloadSingleSeatQrPng(seat: ILSSeat): Promise<void> {
  const payload = buildSeatQrPayload(seat.qrCodeToken);
  const canvas = document.createElement('canvas');
  const width = 720;
  const height = 940;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Card background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Deep navy IBA header banner
  ctx.fillStyle = '#0B1F3A';
  ctx.fillRect(0, 0, width, 152);

  // Teal accent bar
  ctx.fillStyle = '#0D9488';
  ctx.fillRect(0, 152, width, 8);

  // Header text
  ctx.fillStyle = '#5EEAD4';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IBA DIGITAL LIBRARY · KARACHI', width / 2, 56);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('Individual Learning Space', width / 2, 108);

  // Seat Number
  ctx.fillStyle = '#0B1F3A';
  ctx.font = '800 58px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(seat.id, width / 2, 236);

  // Zone & Floor
  ctx.fillStyle = '#475569';
  ctx.font = '500 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${seat.zone}  ·  ${seat.floor}`, width / 2, 276);

  // Render genuine scannable QR code onto offscreen canvas
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, payload, {
    width: 440,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0B1F3A', light: '#FFFFFF' },
  });

  // Subtle frame behind QR
  const qrX = (width - 460) / 2;
  const qrY = 306;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(qrX, qrY, 460, 460);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 3;
  ctx.strokeRect(qrX, qrY, 460, 460);
  ctx.drawImage(qrCanvas, qrX + 10, qrY + 10, 440, 440);

  // Instructions
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('Scan with Student Portal QR Scanner to Reserve', width / 2, 824);

  // Token footer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`Token: ${seat.qrCodeToken}`, width / 2, 872);

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        triggerFileDownload(blob, `IBA-${seat.id}-QR.png`);
      }
      resolve();
    }, 'image/png');
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates and downloads a self-contained printable A4 HTML sheet containing all 30 scannable ILS QR codes.
 */
export async function downloadAllSeatsPrintableSheet(seats: ILSSeat[]): Promise<void> {
  const sorted = [...seats].sort((a, b) => a.number - b.number);
  const qrImages = await Promise.all(
    sorted.map(async (seat) => ({
      seat,
      dataUrl: await generateQrDataUrl(buildSeatQrPayload(seat.qrCodeToken), 280),
    }))
  );

  const cardsHtml = qrImages
    .map(
      ({ seat, dataUrl }) => `
      <div class="card">
        <div class="card-head">
          <div class="brand">IBA DIGITAL LIBRARY</div>
          <div class="seat-id">${escapeHtml(seat.id)}</div>
        </div>
        <div class="zone">${escapeHtml(seat.zone)} · ${escapeHtml(seat.floor)}</div>
        <div class="qr-wrap">
          <img src="${dataUrl}" alt="QR Code for ${escapeHtml(seat.id)}" width="176" height="176" />
        </div>
        <div class="hint">Scan with Student Portal to Reserve</div>
        <div class="token">${escapeHtml(seat.qrCodeToken)}</div>
      </div>`
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>IBA Digital Library — Printable ILS QR Code Sheet (ILS-01 to ILS-30)</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0B1F3A;
      background: #F8FAFC;
    }
    .toolbar {
      max-width: 1020px;
      margin: 0 auto 20px;
      padding: 16px 20px;
      background: #0B1F3A;
      color: #FFFFFF;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .toolbar h1 { margin: 0; font-size: 16px; font-weight: 700; }
    .toolbar p { margin: 4px 0 0; font-size: 12px; color: #CBD5E1; }
    .print-btn {
      border: 0;
      background: #0D9488;
      color: #FFFFFF;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .grid {
      max-width: 1020px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      padding: 14px;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .card-head {
      background: #0B1F3A;
      color: #FFFFFF;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .brand {
      font-size: 9px;
      letter-spacing: 0.08em;
      color: #5EEAD4;
      font-weight: 700;
    }
    .seat-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 20px;
      font-weight: 800;
      margin-top: 2px;
    }
    .zone {
      font-size: 10px;
      color: #475569;
      margin: 8px 0 6px;
    }
    .qr-wrap {
      display: inline-block;
      padding: 6px;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      background: #FFFFFF;
    }
    .qr-wrap img { display: block; }
    .hint {
      font-size: 10px;
      font-weight: 600;
      color: #0F172A;
      margin-top: 8px;
    }
    .token {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      color: #64748B;
      margin-top: 3px;
    }
    @media print {
      body { background: #FFFFFF; padding: 0; }
      .toolbar { display: none; }
      .grid { max-width: none; gap: 10px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>IBA Digital Library — Permanent Desk QR Sheet (ILS-01 to ILS-30)</h1>
      <p>Cut along card outlines and affix each QR plaque to its corresponding Floor 2 Individual Learning Space.</p>
    </div>
    <button class="print-btn" onclick="window.print()">Print Sheet</button>
  </div>
  <div class="grid">
    ${cardsHtml}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerFileDownload(blob, 'IBA-Digital-Library-30-ILS-QR-Sheet.html');
}
