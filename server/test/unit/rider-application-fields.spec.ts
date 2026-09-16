import {
  checkAadhaarLast4,
  checkDateOfBirth,
  checkEmergencyPhone,
  checkHomePincode,
  checkIfsc,
  checkPan,
  normalizeVehicleNumber,
} from '../../src/rider/application-fields';

describe('checkDateOfBirth', () => {
  const NOW = new Date('2026-09-14T00:00:00Z');

  it('accepts someone who turned 18 yesterday', () => {
    const result = checkDateOfBirth('2008-09-13', NOW);
    expect('date' in result).toBe(true);
  });

  it('refuses someone who turns 18 tomorrow', () => {
    const result = checkDateOfBirth('2008-09-15', NOW);
    expect('error' in result).toBe(true);
  });

  it('refuses a date of birth in the future', () => {
    const result = checkDateOfBirth('2030-01-01', NOW);
    expect('error' in result).toBe(true);
  });

  it('refuses unparsable input', () => {
    expect('error' in checkDateOfBirth('not-a-date', NOW)).toBe(true);
  });
});

describe('checkHomePincode', () => {
  it('accepts a real 6-digit shape', () => {
    expect(checkHomePincode('160017')).toBeNull();
  });

  it('refuses a pincode starting with 0', () => {
    expect(checkHomePincode('060017')).not.toBeNull();
  });

  it('refuses the wrong length', () => {
    expect(checkHomePincode('1600')).not.toBeNull();
  });
});

describe('checkEmergencyPhone', () => {
  it('accepts a real Indian mobile different from the rider’s own', () => {
    const result = checkEmergencyPhone('98450 12345', '+919988776655');
    expect('phone' in result).toBe(true);
  });

  it('refuses the rider’s own number', () => {
    const result = checkEmergencyPhone('9845012345', '+919845012345');
    expect('error' in result).toBe(true);
  });

  it('refuses something that is not a phone number', () => {
    expect('error' in checkEmergencyPhone('not a phone', null)).toBe(true);
  });
});

describe('normalizeVehicleNumber', () => {
  it('accepts a plate with spaces and lowercase, normalising both', () => {
    const result = normalizeVehicleNumber('pb 65 ab 1234');
    expect(result).toEqual({ value: 'PB65AB1234' });
  });

  it('accepts the shorter one-letter-series shape', () => {
    const result = normalizeVehicleNumber('DL1CA1234');
    expect('value' in result).toBe(true);
  });

  it('refuses something that is not a plate', () => {
    expect('error' in normalizeVehicleNumber('MY BIKE')).toBe(true);
  });
});

describe('checkPan', () => {
  it('accepts a valid shape', () => {
    expect(checkPan('ABCDE1234F')).toBeNull();
  });

  it('refuses the wrong shape', () => {
    expect(checkPan('1234567890')).not.toBeNull();
  });
});

describe('checkIfsc', () => {
  it('accepts a valid shape', () => {
    expect(checkIfsc('HDFC0001234')).toBeNull();
  });

  it('refuses a code missing the mandatory zero', () => {
    expect(checkIfsc('HDFC1001234')).not.toBeNull();
  });
});

describe('checkAadhaarLast4', () => {
  it('accepts exactly 4 digits', () => {
    expect(checkAadhaarLast4('1234')).toEqual({ value: '1234' });
  });

  it('refuses a full 12-digit Aadhaar number with its own message (D12)', () => {
    const result = checkAadhaarLast4('123456789012');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/last 4 digits/i);
    }
  });

  it('refuses a length that is neither 4 nor 12', () => {
    expect('error' in checkAadhaarLast4('123')).toBe(true);
  });
});
