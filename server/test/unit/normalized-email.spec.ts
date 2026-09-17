import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from '../../src/auth/dto/forgot-password.dto';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { RegisterDto } from '../../src/auth/dto/register.dto';

/**
 * Finding [1]: the legacy register/login/forgot-password paths did not
 * lowercase an email the way `identifier.util.ts#parseIdentifier` does for
 * every other auth path, so `Person@Example.com` and `person@example.com`
 * were two different rows against a plain (non-citext) unique column —
 * duplicate accounts on register, lockouts on login/reset.
 *
 * `@NormalizedEmail()` closes that by lowercasing (and trimming) in the
 * same place every other field's `@Transform` already runs, under the
 * global `ValidationPipe({ transform: true })` — these tests exercise it
 * the same way that pipe would, via `plainToInstance` + `validate`.
 */
describe('email normalization on the legacy auth DTOs', () => {
  it.each([
    ['RegisterDto', RegisterDto, { name: 'A Maker', email: 'Person@Example.COM', password: 'longenoughpw' }],
    ['LoginDto', LoginDto, { email: 'Person@Example.COM', password: 'whatever' }],
    ['ForgotPasswordDto', ForgotPasswordDto, { email: '  Person@Example.COM  ' }],
  ])('%s lowercases and trims email before validation', async (_label, Dto, payload) => {
    const instance = plainToInstance(Dto, payload);
    const errors = await validate(instance as object);

    expect(errors).toHaveLength(0);
    expect((instance as { email: string }).email).toBe('person@example.com');
  });

  it('still refuses a malformed email after normalization', async () => {
    const instance = plainToInstance(LoginDto, { email: 'not-an-email', password: 'whatever' });
    const errors = await validate(instance as object);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});

/**
 * Finding [3]: every other password field in `server/src/auth/dto/` pairs
 * `@MinLength` with `@MaxLength(128)` so the field can't be used to hand
 * an unbounded string to `argon2.verify` on every request. `LoginDto` was
 * the one missing it.
 */
describe('LoginDto.password length bound', () => {
  it('refuses a password over 128 characters', async () => {
    const instance = plainToInstance(LoginDto, {
      email: 'person@example.com',
      password: 'a'.repeat(129),
    });
    const errors = await validate(instance as object);

    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts a password at the 128-character bound', async () => {
    const instance = plainToInstance(LoginDto, {
      email: 'person@example.com',
      password: 'a'.repeat(128),
    });
    const errors = await validate(instance as object);

    expect(errors).toHaveLength(0);
  });
});
