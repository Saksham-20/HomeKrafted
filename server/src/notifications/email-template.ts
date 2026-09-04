/**
 * The one HTML shell every Homekrafted email is rendered into
 * (2026-09-04).
 *
 * Before this, everything the platform emailed was a plain-text blob
 * built at the call site — a password reset, a HomeKrafter's invite, and
 * every notification, each writing its own layout by writing none. Real
 * mail from a real marketplace is the first thing a new HomeKrafter sees
 * of us, and the invite is the message their whole ability to sign in
 * depends on.
 *
 * **Every message is sent as both HTML and text**, never HTML alone: a
 * plain-text part is what stops a mail client with images and styles off
 * from rendering an empty message, and it is the version an SMS-length
 * preview shows. `renderEmail` returns both from one input so they cannot
 * drift.
 *
 * **Table layout and inline styles, on purpose.** Mail clients are not
 * browsers: Outlook ignores flexbox and grid entirely, and Gmail strips
 * `<style>` blocks in some contexts. Nothing here uses a CSS class, a
 * custom property or an external asset — the tokens are copied in as
 * literal hex, which is the one place in this repo where that is correct,
 * because `var(--hk-pine)` resolves to nothing in an inbox.
 *
 * **One image: the logo, with a text fallback** (2026-09-04, owner's
 * call). It is a **PNG** because no mail client renders SVG — Gmail
 * included — served from our own origin, and it carries `alt="Homekrafted"`
 * so a client with remote images off still shows the brand's name rather
 * than a broken-image icon.
 *
 * **Transparent, in two variants, centred.** A logo on a white plate is a
 * white plate: Gmail's dark mode darkens the message's own backgrounds
 * but never touches the pixels of an image, so the mark sat in a bright
 * rectangle in the middle of a dark card. Transparency fixes that half —
 * and creates the other half, because the wordmark's lower line is dark
 * green, which then sits on near-black. So there are two files: the mark
 * as drawn, and one with that green swapped for the cream the design
 * system already uses on dark ground (`--hk-on-pine`); a
 * `prefers-color-scheme` media query shows whichever fits. The gold half
 * is untouched — it reads on both. A client that ignores the query gets
 * the light one, which is the correct default for the majority of inboxes.
 */

/**
 * Where the logo is fetched from. Absolute, because an email has no
 * origin to resolve a relative path against, and read from the same
 * `SITE_URL` the rest of the server uses so a staging box does not link
 * production's asset.
 */
const SITE = (process.env.SITE_URL ?? 'https://homekrafted.in').replace(/\/$/, '');
const LOGO_URL = `${SITE}/email/logo.png`;
const LOGO_DARK_URL = `${SITE}/email/logo-dark.png`;

/** The brand's ink, copied literally — see the note above on why not tokens. */
const PINE = '#2F4F3F';
/** `--hk-gold-text-sm`: the only gold that may carry words (M34). The brand gold itself is a fill, and the header's mark is where it lives now. */
const GOLD_TEXT = '#886815';
const INK = '#22201C';
const INK_2 = '#4A463E';
const MUTED = '#766C5D';
const CANVAS = '#F4F3F0';
const BORDER = '#ECEAE4';

export interface EmailButton {
  label: string;
  url: string;
}

export interface EmailContent {
  /** The `<h1>` inside the message. Usually the same sentence as the subject. */
  heading: string;
  /** "Hi Anjali," — omitted when we do not know a name. */
  greeting?: string;
  /** One paragraph per entry. Plain sentences; no markup. */
  paragraphs: string[];
  /** The one thing to do next, rendered as a button and repeated as a bare URL beneath it. */
  button?: EmailButton;
  /**
   * Label/value rows in a bordered box — an order's items, a parcel's
   * carrier and waybill. Kept out of `paragraphs` because these are facts
   * to scan, not prose to read.
   */
  facts?: Array<{ label: string; value: string }>;
  /** Small print under the rule: why they got this, how to stop it. */
  footnote?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Escapes the five characters that matter in HTML.
 *
 * Every value passed in here is somebody's typed input at one remove — a
 * kitchen's name, a moderator's rejection reason, a product title — so
 * the escape is not optional. An unescaped `&` also silently breaks
 * tracking URLs, which is the version of this bug that gets noticed last.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A URL safe to put in an `href`.
 *
 * Only `http(s)` survives. A `javascript:` or `data:` URL in a link we
 * render is a real hazard in the webmail clients that honour them, and
 * every URL this file receives is built server-side, so refusing the rest
 * costs nothing.
 */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return escapeHtml(parsed.toString());
  } catch {
    return null;
  }
}

export function renderEmail(content: EmailContent): RenderedEmail {
  const paragraphs = content.paragraphs
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK_2};">${escapeHtml(line)}</p>`,
    )
    .join('');

  const facts = content.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:10px;border-collapse:separate;">` +
      content.facts
        .map(
          (fact, index) =>
            `<tr>` +
            `<td style="padding:11px 16px;font-size:13px;color:${MUTED};${index ? `border-top:1px solid ${BORDER};` : ''}">${escapeHtml(fact.label)}</td>` +
            `<td style="padding:11px 16px;font-size:14px;color:${INK};text-align:right;${index ? `border-top:1px solid ${BORDER};` : ''}">${escapeHtml(fact.value)}</td>` +
            `</tr>`,
        )
        .join('') +
      `</table>`
    : '';

  const buttonUrl = content.button ? safeUrl(content.button.url) : null;
  const button =
    content.button && buttonUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">` +
        `<tr><td style="background:${PINE};border-radius:999px;">` +
        `<a href="${buttonUrl}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${escapeHtml(content.button.label)}</a>` +
        `</td></tr></table>` +
        // The bare URL under the button, always. A button is a link that
        // some clients will not render and nobody can copy out of a
        // printed page — and this is often the only way into an account.
        `<p style="margin:0 0 16px;font-size:12.5px;line-height:1.5;color:${MUTED};word-break:break-all;">Or paste this into your browser:<br>${buttonUrl}</p>`
      : '';

  const greeting = content.greeting
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK_2};">${escapeHtml(content.greeting)}</p>`
    : '';

  const footnote = content.footnote
    ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font-size:12.5px;line-height:1.5;color:${MUTED};">${escapeHtml(content.footnote)}</p>`
    : '';

  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Tells a client we have thought about both schemes, which is what
    // stops some of them force-inverting the whole message.
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    // The one <style> block in the message, and it does exactly one job:
    // swap the logo variant. Everything else stays inline, because Gmail
    // drops <style> in some contexts and inline styles always survive —
    // a dropped block here costs the dark variant, nothing more.
    `<style>@media (prefers-color-scheme: dark){` +
    `.hk-logo-light{display:none!important}` +
    `.hk-logo-dark{display:inline-block!important}` +
    `}</style>` +
    `<title>${escapeHtml(content.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${CANVAS};">` +
    // Preheader: the grey line an inbox shows after the subject. Hidden
    // in the message itself, so it must not repeat the heading verbatim.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.paragraphs[0] ?? '')}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CANVAS};padding:28px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">` +
    `<tr><td align="center" style="padding:24px 28px 18px;border-bottom:1px solid ${BORDER};">` +
    // `alt` carries the brand when images are blocked; the explicit
    // width/height stop Outlook sizing it from the file's own pixels.
    `<img class="hk-logo-light" src="${LOGO_URL}" alt="Homekrafted" width="180" height="103" style="display:inline-block;border:0;outline:none;text-decoration:none;">` +
    `<img class="hk-logo-dark" src="${LOGO_DARK_URL}" alt="Homekrafted" width="180" height="103" style="display:none;border:0;outline:none;text-decoration:none;">` +
    // Gold-family text takes the darkened token, never `--hk-gold` — the
    // brand gold fails AA as copy (M34). Literal hex, same reason as the
    // rest of this file.
    `<div style="margin-top:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD_TEXT};">Homemade, handpicked</div>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">` +
    `<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${INK};font-weight:600;">${escapeHtml(content.heading)}</h1>` +
    greeting +
    paragraphs +
    facts +
    button +
    footnote +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px 22px;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">` +
    `Homekrafted — home-cooked food and handmade gifts from real home kitchens across Chandigarh, Mohali, Panchkula and Zirakpur.` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const textParts = [
    content.heading,
    '',
    ...(content.greeting ? [content.greeting, ''] : []),
    ...content.paragraphs.flatMap((line) => [line, '']),
    ...(content.facts?.length
      ? [...content.facts.map((fact) => `${fact.label}: ${fact.value}`), '']
      : []),
    ...(content.button && buttonUrl ? [`${content.button.label}: ${content.button.url}`, ''] : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    '— Homekrafted',
  ];

  return { html, text: textParts.join('\n') };
}
