import { isOtpLocked, otpMatches, MAX_OTP_ATTEMPTS } from '../../src/rider/otp-lock';

describe('isOtpLocked', () => {
  it('is not locked below the ceiling', () => {
    expect(isOtpLocked(0)).toBe(false);
    expect(isOtpLocked(MAX_OTP_ATTEMPTS - 1)).toBe(false);
  });

  it('locks exactly at the ceiling and beyond', () => {
    expect(isOtpLocked(MAX_OTP_ATTEMPTS)).toBe(true);
    expect(isOtpLocked(MAX_OTP_ATTEMPTS + 5)).toBe(true);
  });
});

describe('otpMatches', () => {
  it('matches the identical code', () => {
    expect(otpMatches('1234', '1234')).toBe(true);
  });

  it('refuses a different code of the same length', () => {
    expect(otpMatches('1234', '5678')).toBe(false);
  });

  it('refuses a different length outright rather than comparing a prefix', () => {
    expect(otpMatches('123', '1234')).toBe(false);
    expect(otpMatches('12345', '1234')).toBe(false);
  });

  it('is case- and value-exact — no coercion', () => {
    expect(otpMatches('0000', '0001')).toBe(false);
  });
});
