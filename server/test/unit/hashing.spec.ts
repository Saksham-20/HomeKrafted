import * as argon2 from 'argon2';
import { OTP_HASH_OPTIONS, PASSWORD_HASH_OPTIONS } from '../../src/auth/hashing';

/**
 * These parameters are a security control, so they are pinned rather than
 * left to whatever the library defaults to — which is exactly how they
 * drifted in the first place (M31 found all seven call sites running
 * `m=65536, t=3, p=4` because nobody had ever stated a choice).
 *
 * The digest carries its own parameters, which is what makes this
 * testable at all: a stored hash says what it cost, so these assertions
 * read the real thing rather than the object we passed in.
 */
describe('argon2 parameters', () => {
  const password = 'Passw0rd!123';

  /** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` → `m=19456,t=2,p=1`. */
  const paramsOf = (digest: string): string => digest.split('$')[3];

  it('hashes passwords at the OWASP argon2id reference cost', async () => {
    const digest = await argon2.hash(password, PASSWORD_HASH_OPTIONS);

    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(paramsOf(digest)).toBe('m=19456,t=2,p=1');
  });

  it('hashes one-time codes cheaper than passwords, and says so in the digest', async () => {
    const digest = await argon2.hash('123456', OTP_HASH_OPTIONS);

    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(paramsOf(digest)).toBe('m=8192,t=2,p=1');
    // The relationship, not just the numbers: a code is allowed to be
    // cheaper than a password, never the other way round.
    expect(OTP_HASH_OPTIONS.memoryCost as number).toBeLessThan(
      PASSWORD_HASH_OPTIONS.memoryCost as number,
    );
  });

  it('still verifies a password hashed under the old library defaults', async () => {
    // What every account created before M31 has stored.
    const legacy = await argon2.hash(password);
    expect(paramsOf(legacy)).toBe('m=65536,t=3,p=4');

    await expect(argon2.verify(legacy, password)).resolves.toBe(true);
    await expect(argon2.verify(legacy, 'not-the-password')).resolves.toBe(false);
  });

  it('marks an old-default digest as needing a re-hash, and a current one as not', async () => {
    const legacy = await argon2.hash(password);
    const current = await argon2.hash(password, PASSWORD_HASH_OPTIONS);

    // This is what `AuthService.maybeRehash` branches on. If it ever
    // returned false for a legacy digest, every pre-M31 account would
    // keep paying the old cost on every sign-in, forever.
    expect(argon2.needsRehash(legacy, PASSWORD_HASH_OPTIONS)).toBe(true);
    expect(argon2.needsRehash(current, PASSWORD_HASH_OPTIONS)).toBe(false);
  });
});
