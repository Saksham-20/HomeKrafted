import { parseIdentifier } from '../../src/auth/identifier.util';

/**
 * The single sign-in box.
 *
 * Everything about the M25 form rests on this: get the split wrong and a
 * real person's real number is "enter a mobile number or an email
 * address", which is the whole sign-up funnel. The India-default cases
 * are the ones worth being fussy about — nobody in Mohali types `+91`.
 */
describe('parseIdentifier', () => {
  describe('phone numbers', () => {
    it.each([
      ['9845012345', '+919845012345'],
      ['+919845012345', '+919845012345'],
      ['+91 98450 12345', '+919845012345'],
      ['098450 12345', '+919845012345'],
      ['98450-12345', '+919845012345'],
      ['  9845012345  ', '+919845012345'],
    ])('reads %j as %s', (input, expected) => {
      expect(parseIdentifier(input)).toEqual({ kind: 'phone', value: expected });
    });

    it('keeps an explicit country code rather than forcing India', () => {
      // The default region must widen what is accepted, never narrow it.
      expect(parseIdentifier('+14155552671')).toEqual({
        kind: 'phone',
        value: '+14155552671',
      });
    });

    it('normalises every spelling of one number to the same value', () => {
      // If these diverged, the same person would get two accounts
      // depending on how they happened to type it that day.
      const spellings = ['9845012345', '+919845012345', '+91 98450 12345', '098450-12345'];
      const values = new Set(spellings.map((s) => parseIdentifier(s)?.value));
      expect(values.size).toBe(1);
    });
  });

  describe('email addresses', () => {
    it.each([
      ['someone@example.com', 'someone@example.com'],
      ['Someone@Example.COM', 'someone@example.com'],
      ['  cook@kitchen.co.in  ', 'cook@kitchen.co.in'],
      ['first.last+tag@example.org', 'first.last+tag@example.org'],
    ])('reads %j as %s', (input, expected) => {
      expect(parseIdentifier(input)).toEqual({ kind: 'email', value: expected });
    });

    it('lowercases so one address cannot become two accounts', () => {
      expect(parseIdentifier('COOK@example.com')?.value).toBe(
        parseIdentifier('cook@example.com')?.value,
      );
    });
  });

  describe('refusals', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'whitespace only'],
      ['12345', 'too short to be a number'],
      ['not an identifier', 'prose'],
      ['someone@', 'no domain'],
      ['@example.com', 'no mailbox'],
      ['someone@example', 'no dot in the domain'],
      ['someone@@example.com', 'two at-signs'],
      ['some one@example.com', 'space in the mailbox'],
    ])('refuses %j (%s)', (input) => {
      expect(parseIdentifier(input)).toBeNull();
    });

    it('reports a malformed email as neither, rather than trying it as a number', () => {
      // An `@` can never appear in a phone number, so anything carrying
      // one is an email attempt — feeding it to the phone parser would
      // produce "that is not a valid mobile number" for a typo'd address.
      expect(parseIdentifier('cook@@kitchen.com')).toBeNull();
    });
  });
});
