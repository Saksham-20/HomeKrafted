import { csvCell, toCsv } from '../../src/admin/exports.service';

/**
 * CSV formula injection is the sharpest edge in the admin exports, and it
 * is entirely invisible in the product: a HomeKrafter naming their shop
 * `=cmd|'/c calc'!A1` sees a normal shop name everywhere on the site, and
 * the payload only fires on the machine of whoever opens the export in
 * Excel, Sheets or LibreOffice.
 *
 * The guard lives in one function precisely so it cannot be forgotten
 * per-column, which makes this the one place worth pinning it down.
 */

describe('csvCell — formula neutralisation', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'prefixes a value starting with %j so a spreadsheet treats it as text',
    (prefix) => {
      expect(csvCell(`${prefix}SUM(A1:A9)`)).toBe(`"'${prefix}SUM(A1:A9)"`);
    },
  );

  it('neutralises the DDE payload that made this necessary', () => {
    expect(csvCell(`=cmd|'/c calc'!A1`)).toBe(`"'=cmd|'/c calc'!A1"`);
  });

  it('leaves an ordinary value alone rather than mangling every cell', () => {
    // Over-escaping would put a stray quote in front of every seller name
    // in the export, which is its own kind of broken.
    expect(csvCell('Sunita Kitchen')).toBe('"Sunita Kitchen"');
    expect(csvCell('Sector 34, Chandigarh')).toBe('"Sector 34, Chandigarh"');
  });

  it('guards a formula character only in the leading position', () => {
    // A spreadsheet only evaluates a cell that *begins* with one.
    expect(csvCell('Sweet - Savoury')).toBe('"Sweet - Savoury"');
    expect(csvCell('a@b.com')).toBe('"a@b.com"');
  });

  it('still guards a phone number written with a leading plus', () => {
    // The common real-world false positive — and it genuinely is a
    // formula to Excel, so the quote is correct, not over-eager.
    expect(csvCell('+919008033445')).toBe(`"'+919008033445"`);
  });
});

describe('csvCell — escaping', () => {
  it('doubles embedded quotes', () => {
    expect(csvCell('Sunita"s')).toBe('"Sunita""s"');
  });

  it('needs no special case for commas or newlines, because everything is quoted', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('renders null and undefined as an empty cell, not as the word "null"', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('renders a Date as ISO rather than a locale string', () => {
    // A locale string would make the export depend on the server's TZ
    // setting, and reconciliation against a bank statement needs one
    // unambiguous form.
    expect(csvCell(new Date('2026-08-02T10:30:00.000Z'))).toBe('"2026-08-02T10:30:00.000Z"');
  });

  it('renders numbers and booleans as themselves', () => {
    expect(csvCell(1250)).toBe('"1250"');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(false)).toBe('"false"');
  });

  it('guards a negative number, because Excel cannot tell it from a formula', () => {
    expect(csvCell(-560)).toBe(`"'-560"`);
  });
});

describe('toCsv', () => {
  it('joins with CRLF and ends with one, as the spec and Excel expect', () => {
    const csv = toCsv(['A', 'B'], [[1, 2]]);
    expect(csv).toBe('"A","B"\r\n"1","2"\r\n');
  });

  it('escapes the header row too', () => {
    // Headers are ours today, but nothing stops a future export naming a
    // column from data.
    expect(toCsv(['=A'], [])).toBe(`"'=A"\r\n`);
  });

  it('emits a header-only file rather than nothing when there are no rows', () => {
    // An empty file reads as a failed export; a header row reads as "no
    // payouts in that window", which is the truth.
    expect(toCsv(['Payout ID'], [])).toBe('"Payout ID"\r\n');
  });
});
