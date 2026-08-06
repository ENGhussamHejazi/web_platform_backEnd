/**
 * Shared email layout used by every transactional template.
 *
 * Email clients (Gmail, Outlook) strip <style> blocks, flexbox and CSS grid, so
 * everything here is table-based with inline styles only — the same constraint
 * the original application-receipt template already worked under, just factored
 * out so all emails share one look instead of each one re-inventing it.
 *
 * Branding is a parameter, not a constant: platform emails render as TRENDWA,
 * while storefront emails render with the merchant's own store name and
 * `Store.primaryColor`, so a customer never receives an email that looks like
 * it came from a company they've never heard of.
 */

export interface EmailBrand {
  /** Name shown in the header bar and footer — platform or store name. */
  name: string;
  /** Hex accent used for the header bar and the CTA button. */
  color: string;
  /** Absolute logo URL; falls back to the name as a wordmark when absent. */
  logoUrl?: string | null;
}

export interface EmailButton {
  label: string;
  url: string;
}

export interface EmailRow {
  label: string;
  value: string;
  /** Renders the value bigger/bolder — used for the order total row. */
  emphasis?: boolean;
}

export interface EmailTable {
  head: string[];
  rows: string[][];
  /** Column indexes to right-align (numbers/prices). */
  numericColumns?: number[];
}

export interface EmailContent {
  /** Small grey line under the title (also used as the inbox preheader). */
  preheader: string;
  title: string;
  /** Optional coloured pill above the title, e.g. an order status. */
  badge?: { label: string; tone: 'info' | 'success' | 'warning' | 'danger' };
  /** Body paragraphs, in order. Plain text — escaped before rendering. */
  paragraphs: string[];
  rows?: EmailRow[];
  table?: EmailTable;
  button?: EmailButton;
  /** Muted closing note, e.g. "you're receiving this because…". */
  footnote?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_COLOR = '#0EA5A4';
const FONT = "Tahoma, 'Segoe UI', Arial, sans-serif";

const BADGE_TONES: Record<string, { bg: string; fg: string }> = {
  info: { bg: '#E0F2FE', fg: '#075985' },
  success: { bg: '#DCFCE7', fg: '#166534' },
  warning: { bg: '#FEF3C7', fg: '#92400E' },
  danger: { bg: '#FEE2E2', fg: '#991B1B' },
};

export function escapeHtml(value: string): string {
  return String(value).replace(
    /[&<>"']/gu,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[char]!,
  );
}

/** Guards against a malformed stored primaryColor breaking the inline style. */
function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{3,8}$/u.test(color) ? color : DEFAULT_COLOR;
}

function renderHeader(brand: EmailBrand): string {
  const color = safeColor(brand.color);
  const inner = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="36" style="height:36px;max-width:200px;display:block;margin:0 auto;border:0;" />`
    : `<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(brand.name)}</span>`;
  return `<tr><td style="background:${color};padding:22px 24px;text-align:center;">${inner}</td></tr>`;
}

function renderBadge(badge: EmailContent['badge']): string {
  if (!badge) return '';
  const tone = BADGE_TONES[badge.tone] ?? BADGE_TONES.info;
  return `<div style="margin:0 0 14px;"><span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:bold;padding:6px 14px;border-radius:999px;">${escapeHtml(badge.label)}</span></div>`;
}

function renderRows(rows: EmailRow[] | undefined): string {
  if (!rows?.length) return '';
  const body = rows
    .map(
      (row) => `<tr>
        <td style="padding:9px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(row.label)}</td>
        <td style="padding:9px 0;color:#0f172a;font-size:${row.emphasis ? '16px' : '13px'};font-weight:bold;text-align:left;border-bottom:1px solid #f1f5f9;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" style="margin:18px 0;border-collapse:collapse;">${body}</table>`;
}

function renderTable(table: EmailTable | undefined): string {
  if (!table?.rows.length) return '';
  const numeric = new Set(table.numericColumns ?? []);
  const head = table.head
    .map(
      (cell, i) =>
        `<th style="padding:10px 8px;background:#f8fafc;color:#475569;font-size:12px;font-weight:bold;text-align:${numeric.has(i) ? 'left' : 'right'};border-bottom:1px solid #e2e8f0;">${escapeHtml(cell)}</th>`,
    )
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td style="padding:10px 8px;color:#0f172a;font-size:13px;text-align:${numeric.has(i) ? 'left' : 'right'};border-bottom:1px solid #f1f5f9;">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" style="margin:18px 0;border-collapse:collapse;">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderButton(button: EmailButton | undefined, color: string): string {
  if (!button) return '';
  return `<div style="text-align:center;margin:26px 0 6px;">
    <a href="${escapeHtml(button.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:bold;">${escapeHtml(button.label)}</a>
  </div>`;
}

/** Builds the full HTML + plain-text alternative for one email. */
export function renderEmail(
  brand: EmailBrand,
  subject: string,
  content: EmailContent,
): RenderedEmail {
  const color = safeColor(brand.color);
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.9;">${escapeHtml(p)}</p>`,
    )
    .join('');

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT};" dir="rtl">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" style="background:#f1f5f9;padding:28px 12px;border-collapse:collapse;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border-collapse:collapse;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          ${renderHeader(brand)}
          <tr><td style="padding:26px 24px 8px;text-align:right;">
            ${renderBadge(content.badge)}
            <h1 style="margin:0 0 6px;color:#0f172a;font-size:19px;font-weight:bold;">${escapeHtml(content.title)}</h1>
            <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">${escapeHtml(content.preheader)}</p>
            ${paragraphs}
            ${renderTable(content.table)}
            ${renderRows(content.rows)}
            ${renderButton(content.button, color)}
          </td></tr>
          <tr><td style="padding:18px 24px 26px;text-align:center;border-top:1px solid #f1f5f9;">
            ${content.footnote ? `<p style="margin:0 0 8px;color:#94a3b8;font-size:12px;line-height:1.8;">${escapeHtml(content.footnote)}</p>` : ''}
            <p style="margin:0;color:#cbd5e1;font-size:11px;">${escapeHtml(brand.name)} — هذه رسالة آلية، لا حاجة للرد عليها.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const textParts = [
    content.title,
    '',
    ...content.paragraphs,
    ...(content.table?.rows.length
      ? ['', ...content.table.rows.map((r) => r.join(' — '))]
      : []),
    ...(content.rows?.length
      ? ['', ...content.rows.map((r) => `${r.label}: ${r.value}`)]
      : []),
    ...(content.button
      ? ['', `${content.button.label}: ${content.button.url}`]
      : []),
    ...(content.footnote ? ['', content.footnote] : []),
    '',
    `— ${brand.name}`,
  ];

  return { subject, html, text: textParts.join('\n') };
}
