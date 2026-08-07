import { NAMED_ATTEMPTS, generateReferralCode } from '../../src/auth/referral-code.util';

/**
 * The eleventh Priya.
 *
 * A referral code is derived from a first name plus a suffix, and the
 * suffix used to be `250 + attempt` with the caller trying exactly ten
 * attempts. That is not a collision-handling strategy — it is a hard
 * ceiling of **ten accounts per first name, ever**. The eleventh person
 * called Priya to sign up got `409 Could not allocate a unique referral
 * code — please retry`, and retrying could never succeed, because the
 * space was permanently exhausted. On a marketplace whose market is
 * India, that is a signup blocker with a queue of real people behind it.
 *
 * Found while seeding thirty accounts for an unrelated pagination test.
 */
describe('generateReferralCode', () => {
  it('gives the readable code to the first ten people with a name', () => {
    const codes = Array.from({ length: NAMED_ATTEMPTS }, (_, i) => generateReferralCode('Priya', i));

    expect(codes[0]).toBe('PRIYA250');
    expect(codes[NAMED_ATTEMPTS - 1]).toBe('PRIYA259');
    expect(new Set(codes).size).toBe(NAMED_ATTEMPTS);
  });

  it('keeps producing codes past the named space instead of repeating', () => {
    // The exact failure: attempt 10 used to be `PRIYA260`… no. It was
    // never reached — the caller stopped at 10 and threw. Now it must
    // still return something, and something new.
    const named = new Set(
      Array.from({ length: NAMED_ATTEMPTS }, (_, i) => generateReferralCode('Priya', i)),
    );

    const overflow = Array.from({ length: 200 }, () =>
      generateReferralCode('Priya', NAMED_ATTEMPTS),
    );

    expect(overflow.every((code) => code.startsWith('PRIYA'))).toBe(true);
    expect(overflow.some((code) => named.has(code))).toBe(false);
    // Random, so not literally all distinct by guarantee — but 200 draws
    // from 30^4 colliding into fewer than 190 would mean the suffix is
    // not doing its job.
    expect(new Set(overflow).size).toBeGreaterThan(190);
  });

  it('uses only characters that survive being read aloud', () => {
    const codes = Array.from({ length: 300 }, () => generateReferralCode('Priya', NAMED_ATTEMPTS));

    // No O/0, I/1 or S/5 in the generated part — a referral code is read
    // off one screen and typed into someone else's phone, and a misread
    // character is a friend who never gets credited.
    for (const code of codes) {
      expect(code.slice('PRIYA'.length)).not.toMatch(/[OIS015]/);
    }
  });

  it('falls back to a random code when the name yields nothing usable', () => {
    for (const name of ['', ' ', '!', 'A', '?? ??']) {
      const code = generateReferralCode(name);
      expect(code).toMatch(/^HK[A-Z0-9]{6}$/);
    }
  });

  it('caps a long name so the code stays sayable', () => {
    // The stem is capped at 12 characters: BARTHOLOMEWS.
    const code = generateReferralCode('Bartholomewsomethingverylong');
    expect(code).toBe('BARTHOLOMEWS250');
  });

  it('takes the first name only, and strips punctuation', () => {
    expect(generateReferralCode("D'Souza Fernandes")).toBe('DSOUZA250');
    expect(generateReferralCode('Ananya Iyer')).toBe('ANANYA250');
  });
});
