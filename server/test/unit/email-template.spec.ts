import { renderEmail } from '../../src/notifications/email-template';

/**
 * The email shell (2026-09-04).
 *
 * Three rules, each of which fails silently in an inbox rather than in a
 * test run: an unescaped value breaks the markup (and, in the case of
 * `&`, quietly breaks tracking links), a `javascript:` URL in a button is
 * live in the webmail clients that honour it, and a message with no
 * plain-text part renders as blank in a client with HTML off.
 */
describe('renderEmail', () => {
  it('sends both parts, always', () => {
    const { html, text } = renderEmail({ heading: 'Order HK1 is in', paragraphs: ['Paid and sent.'] });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Order HK1 is in');
    expect(text).toContain('Order HK1 is in');
    expect(text).toContain('Paid and sent.');
    expect(text).not.toContain('<');
  });

  it('escapes what people typed', () => {
    const { html } = renderEmail({
      heading: 'Rejected: <script>alert(1)</script>',
      paragraphs: ['Tom & Jerry\'s "kitchen"'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('renders a button and repeats the URL as text, because a button is not always rendered', () => {
    const { html, text } = renderEmail({
      heading: 'Set your password',
      paragraphs: ['Use the link below.'],
      button: { label: 'Set your password', url: 'https://homekrafted.in/reset-password?token=abc&welcome=1' },
    });
    expect(html).toContain('href="https://homekrafted.in/reset-password?token=abc&amp;welcome=1"');
    expect(html).toContain('Or paste this into your browser');
    expect(text).toContain('https://homekrafted.in/reset-password?token=abc&welcome=1');
  });

  it('refuses a non-http button URL rather than rendering it', () => {
    const { html } = renderEmail({
      heading: 'Hello',
      paragraphs: ['Hi'],
      button: { label: 'Click', url: 'javascript:alert(1)' },
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('>Click<');
  });

  it('puts facts in both parts', () => {
    const { html, text } = renderEmail({
      heading: 'Order on the way',
      paragraphs: ['A rider has it.'],
      facts: [{ label: 'Waybill', value: 'SF123456' }],
    });
    expect(html).toContain('SF123456');
    expect(text).toContain('Waybill: SF123456');
  });
});
