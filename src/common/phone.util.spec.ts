import { normalizeIndianMobile } from './phone.util';

describe('normalizeIndianMobile', () => {
  it('accepts common formats', () => {
    expect(normalizeIndianMobile('9876543210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
    expect(normalizeIndianMobile('919876543210')).toBe('+919876543210');
  });
  it('rejects invalid numbers', () => {
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
    expect(normalizeIndianMobile('+14155550123')).toBeNull();
    expect(normalizeIndianMobile('')).toBeNull();
  });
});
