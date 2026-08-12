import {
  checkBusinessName,
  checkContactName,
  checkFssaiNumber,
  normalizeInstagram,
  normalizePhone,
  normalizeWebsite,
} from '../../src/seller-applications/application-fields';

/**
 * The rules that would have stopped two of production's storefronts from
 * being called `jashanpreetsingh3105@gmail.com` and `Abc` (M32).
 *
 * `businessName` was `MinLength(1)`, and it becomes `Vendor.name` and
 * `Seller.displayName` at approval — it is on every product card and
 * every order. A browser autofilling the wrong box put an email address
 * on the marketplace permanently.
 *
 * Tested here rather than through HTTP because `POST /seller-applications`
 * carries a real `@Throttle({ limit: 5, ttl: 60_000 })` — a public
 * endpoint should be throttled, and a spec with twenty cases should not
 * be the reason it is weakened.
 */
describe('business name', () => {
  it('refuses an email address and says which box it belongs in', () => {
    expect(checkBusinessName('jashanpreetsingh3105@gmail.com')).toMatch(/email/i);
  });

  it('refuses a phone number', () => {
    expect(checkBusinessName('98450 12345')).toMatch(/phone/i);
    expect(checkBusinessName('+91-98450-12345')).toMatch(/phone/i);
  });

  it('refuses one character, digits, and punctuation', () => {
    expect(checkBusinessName('A')).toBeTruthy();
    expect(checkBusinessName('...')).toBeTruthy();
    expect(checkBusinessName('12')).toBeTruthy();
    expect(checkBusinessName('   ')).toBeTruthy();
  });

  it('accepts the names real kitchens actually have, including short ones', () => {
    // The rule is shape, not taste. "Abc" is a poor storefront name and a
    // perfectly valid one — that is the admin's decision, not a regex's.
    for (const name of [
      'Abc',
      "Anjali's Kitchen",
      'Terracotta & Thread',
      'The Slow Studio',
      '3 Bakers Co.',
      'मिट्टी',
    ]) {
      expect(checkBusinessName(name)).toBeNull();
    }
  });
});

describe('contact name', () => {
  it('refuses an email and a bare number', () => {
    expect(checkContactName('ila@example.test')).toBeTruthy();
    expect(checkContactName('99')).toBeTruthy();
  });

  it('accepts a one-word name', () => {
    expect(checkContactName('Ila')).toBeNull();
  });
});

describe('phone', () => {
  it('normalises every shape somebody types to one stored form', () => {
    for (const typed of ['9845012345', '98450 12345', '+91 98450 12345', '+919845012345']) {
      expect(normalizePhone(typed)).toEqual({ phone: '+919845012345' });
    }
  });

  it('refuses what nobody can ring — this is the number an admin calls', () => {
    expect(normalizePhone('x')).toHaveProperty('error');
    expect(normalizePhone('98450')).toHaveProperty('error');
    expect(normalizePhone('')).toHaveProperty('error');
  });
});

describe('fssai', () => {
  it('wants fourteen digits, spaces and all', () => {
    expect(checkFssaiNumber('12345678901234')).toBeNull();
    expect(checkFssaiNumber('1234 5678 9012 34')).toBeNull();
  });

  it('refuses anything else, and says it may be left blank', () => {
    expect(checkFssaiNumber('1234')).toMatch(/blank/i);
  });
});

describe('instagram', () => {
  it('takes a handle the way handles are actually written down', () => {
    for (const typed of [
      '@your.kitchen',
      'your.kitchen',
      'instagram.com/your.kitchen',
      'https://www.instagram.com/your.kitchen/',
    ]) {
      expect(normalizeInstagram(typed)).toEqual({ url: 'https://instagram.com/your.kitchen' });
    }
  });

  it('refuses characters Instagram does not allow in a handle', () => {
    expect(normalizeInstagram('your kitchen')).toHaveProperty('error');
  });
});

describe('website', () => {
  it('fills in a missing protocol rather than refusing the applicant', () => {
    expect(normalizeWebsite('yourshop.com')).toEqual({ url: 'https://yourshop.com/' });
  });

  it('refuses a hostname with no dot, which is a typo rather than a shop', () => {
    expect(normalizeWebsite('yourshop')).toHaveProperty('error');
  });
});
