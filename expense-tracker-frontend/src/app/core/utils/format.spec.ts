import { clamp, formatMoney, formatPercent, initials } from './format';

describe('format', () => {
  it('formats rupees with Indian grouping and no needless decimals', () => {
    expect(formatMoney(1234567, 'INR')).toContain('12,34,567');
    expect(formatMoney(55.65, 'INR')).toContain('55.65');
    expect(formatMoney(27849, 'INR')).not.toContain('.');
  });

  it('abbreviates large amounts when compact', () => {
    expect(formatMoney(250000, 'INR', { compact: true })).toMatch(/2\.5\s?L/);
  });

  it('signs positive deltas on request', () => {
    expect(formatMoney(10, 'INR', { signed: true })).toContain('+');
    expect(formatMoney(-10, 'INR', { signed: true })).not.toContain('+');
  });

  it('survives invalid numbers', () => {
    expect(formatMoney(Number.NaN, 'INR')).toContain('0');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(12.345, 1, true)).toBe('+12.3%');
  });

  it('builds initials and clamps', () => {
    expect(initials('Lokesh Kumar')).toBe('LK');
    expect(initials('  ')).toBe('?');
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
