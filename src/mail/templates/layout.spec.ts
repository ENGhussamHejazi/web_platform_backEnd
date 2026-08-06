import { EmailBrand, escapeHtml, renderEmail } from './layout';

const BRAND: EmailBrand = { name: 'TRENDWA', color: '#0EA5A4' };

function render(overrides: Partial<Parameters<typeof renderEmail>[2]> = {}) {
  return renderEmail(BRAND, 'subject', {
    preheader: 'preheader',
    title: 'title',
    paragraphs: ['para'],
    ...overrides,
  });
}

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#039;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });

  it('coerces non-strings rather than throwing', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
  });
});

describe('renderEmail — structure', () => {
  it('returns the subject unchanged and produces both html and text', () => {
    const out = render();
    expect(out.subject).toBe('subject');
    expect(out.html).toContain('<!doctype html>');
    expect(out.text).toContain('title');
    expect(out.text).toContain('para');
  });

  it('renders RTL and Arabic-friendly markup', () => {
    const out = render();
    expect(out.html).toContain('dir="rtl"');
    expect(out.html).toContain('lang="ar"');
  });

  it('hides the preheader visually but keeps it in the markup for inbox previews', () => {
    const out = render({ preheader: 'inbox teaser' });
    expect(out.html).toContain('display:none');
    expect(out.html).toContain('inbox teaser');
  });

  it('always closes with the automated-message footer', () => {
    expect(render().html).toContain('هذه رسالة آلية، لا حاجة للرد عليها');
  });

  it('uses table-based layout, not flexbox or grid, for mail-client support', () => {
    const html = render({ table: { head: ['a'], rows: [['b']] } }).html;
    expect(html).toContain('role="presentation"');
    expect(html).not.toMatch(/display:\s*(flex|grid)/u);
  });
});

describe('renderEmail — branding', () => {
  it('renders the brand name as a wordmark when there is no logo', () => {
    const out = renderEmail({ name: 'متجر الشام', color: '#111111' }, 's', {
      preheader: 'p',
      title: 't',
      paragraphs: [],
    });
    expect(out.html).toContain('متجر الشام');
    expect(out.html).not.toContain('<img');
  });

  it('renders the logo image when one is provided', () => {
    const out = renderEmail(
      { name: 'x', color: '#111111', logoUrl: 'https://cdn.test/logo.png' },
      's',
      { preheader: 'p', title: 't', paragraphs: [] },
    );
    expect(out.html).toContain('<img src="https://cdn.test/logo.png"');
    expect(out.html).toContain('alt="x"');
  });

  it('applies the brand colour to the header bar and the CTA button', () => {
    const out = renderEmail({ name: 'x', color: '#7C3AED' }, 's', {
      preheader: 'p',
      title: 't',
      paragraphs: [],
      button: { label: 'go', url: 'https://test' },
    });
    const occurrences = out.html.split('#7C3AED').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['red; background:url(evil)', 'CSS injection via a stored colour'],
    ['javascript:alert(1)', 'a scheme masquerading as a colour'],
    ['', 'an empty colour'],
  ])('falls back to the default accent for %s', (color) => {
    const out = renderEmail({ name: 'x', color }, 's', {
      preheader: 'p',
      title: 't',
      paragraphs: [],
    });
    expect(out.html).toContain('#0EA5A4');
    expect(out.html).not.toContain('evil');
    expect(out.html).not.toContain('javascript:');
  });

  it.each(['#fff', '#ffffff', '#ffffffff'])(
    'accepts the valid hex form %s',
    (color) => {
      const out = renderEmail({ name: 'x', color }, 's', {
        preheader: 'p',
        title: 't',
        paragraphs: [],
      });
      expect(out.html).toContain(color);
    },
  );
});

describe('renderEmail — escaping of untrusted content', () => {
  it('escapes the title, paragraphs, preheader and footnote', () => {
    const out = render({
      title: '<script>a</script>',
      paragraphs: ['<b>p</b>'],
      preheader: '<i>pre</i>',
      footnote: '<u>foot</u>',
    });
    expect(out.html).not.toContain('<script>a</script>');
    expect(out.html).not.toContain('<b>p</b>');
    expect(out.html).not.toContain('<i>pre</i>');
    expect(out.html).not.toContain('<u>foot</u>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes row labels and values', () => {
    const out = render({
      rows: [{ label: '<l>', value: '<v>' }],
    });
    expect(out.html).not.toContain('<l>');
    expect(out.html).not.toContain('<v>');
  });

  it('escapes table headers and cells', () => {
    const out = render({
      table: { head: ['<h>'], rows: [['<c>']] },
    });
    expect(out.html).not.toContain('<h>');
    expect(out.html).not.toContain('<c>');
  });

  it('escapes the button label and its url, so a crafted url cannot break out of the attribute', () => {
    const out = render({
      button: { label: '<lbl>', url: 'https://x/"><script>a</script>' },
    });
    expect(out.html).not.toContain('<lbl>');
    expect(out.html).not.toContain('"><script>');
  });

  it('escapes the brand name in both the header and the footer', () => {
    const out = renderEmail(
      { name: '<script>x</script>', color: '#fff' },
      's',
      {
        preheader: 'p',
        title: 't',
        paragraphs: [],
      },
    );
    expect(out.html).not.toContain('<script>x</script>');
  });
});

describe('renderEmail — optional blocks', () => {
  it('omits badge, rows, table, button and footnote when not supplied', () => {
    const out = render();
    expect(out.html).not.toContain('<th');
    expect(out.html).not.toContain('border-radius:999px');
    expect(out.html).not.toContain('<a href');
  });

  it('renders an empty table as nothing rather than an empty header row', () => {
    const out = render({ table: { head: ['a', 'b'], rows: [] } });
    expect(out.html).not.toContain('<th');
  });

  it.each([
    ['info', '#E0F2FE'],
    ['success', '#DCFCE7'],
    ['warning', '#FEF3C7'],
    ['danger', '#FEE2E2'],
  ] as const)('renders the %s badge tone', (tone, bg) => {
    const out = render({ badge: { label: 'l', tone } });
    expect(out.html).toContain(bg);
  });

  it('emphasises a row so the order total reads larger than the other rows', () => {
    const out = render({
      rows: [
        { label: 'sub', value: '1' },
        { label: 'total', value: '2', emphasis: true },
      ],
    });
    expect(out.html).toContain('font-size:16px');
    expect(out.html).toContain('font-size:13px');
  });

  it('right-aligns text columns and left-aligns numeric ones', () => {
    const out = render({
      table: {
        head: ['name', 'qty'],
        rows: [['p', '2']],
        numericColumns: [1],
      },
    });
    expect(out.html).toContain('text-align:right');
    expect(out.html).toContain('text-align:left');
  });
});

describe('renderEmail — plain-text alternative', () => {
  it('lists items before totals, matching the html ordering', () => {
    const out = render({
      table: { head: ['h'], rows: [['item-line']] },
      rows: [{ label: 'total', value: '99' }],
    });
    expect(out.text.indexOf('item-line')).toBeLessThan(
      out.text.indexOf('total: 99'),
    );
    expect(out.html.indexOf('item-line')).toBeLessThan(
      out.html.indexOf('total'),
    );
  });

  it('includes the button url so a text-only client can still act', () => {
    const out = render({ button: { label: 'Track', url: 'https://t/1' } });
    expect(out.text).toContain('Track: https://t/1');
  });

  it('does not contain html tags', () => {
    const out = render({
      rows: [{ label: 'a', value: 'b' }],
      table: { head: ['h'], rows: [['c']] },
      button: { label: 'l', url: 'https://u' },
      footnote: 'note',
    });
    expect(out.text).not.toMatch(/<[a-z]/iu);
  });

  it('signs off with the brand name', () => {
    expect(render().text.trimEnd().endsWith('— TRENDWA')).toBe(true);
  });

  it('joins table cells readably', () => {
    const out = render({ table: { head: ['a', 'b'], rows: [['x', 'y']] } });
    expect(out.text).toContain('x — y');
  });
});
