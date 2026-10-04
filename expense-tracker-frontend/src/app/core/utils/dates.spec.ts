import { addMonths, autoGranularity, canShiftForward, daysInRange, presetRange, previousRange, rangeLabel, shiftRange, ymd } from './dates';

describe('dates', () => {
  const today = new Date(2026, 8, 30); // 30 Sep 2026

  it('builds calendar-month and rolling ranges', () => {
    expect(presetRange('month', today)).toEqual({ preset: 'month', from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('7d', today)).toEqual({ preset: '7d', from: '2026-09-24', to: '2026-09-30' });
    expect(presetRange('30d', today).from).toBe('2026-09-01');
    expect(presetRange('ytd', today)).toEqual({ preset: 'ytd', from: '2026-01-01', to: '2026-09-30' });
  });

  it('keeps the all-time range within the 10 year API limit', () => {
    const range = presetRange('all', today);
    expect(daysInRange(range)).toBeLessThanOrEqual(3660);
  });

  it('moves between months, including year boundaries and short months', () => {
    expect(shiftRange({ preset: 'month', from: '2026-01-01', to: '2026-01-31' }, -1)).toEqual({ preset: 'month', from: '2025-12-01', to: '2025-12-31' });
    expect(shiftRange({ preset: 'month', from: '2026-01-01', to: '2026-01-31' }, 1)).toEqual({ preset: 'month', from: '2026-02-01', to: '2026-02-28' });
  });

  it('shifts other ranges by their own length and turns them into custom ranges', () => {
    const shifted = shiftRange({ preset: '7d', from: '2026-09-24', to: '2026-09-30' }, -1);
    expect(shifted).toEqual({ preset: 'custom', from: '2026-09-17', to: '2026-09-23' });
  });

  it('does not allow moving forward past the present', () => {
    expect(canShiftForward({ preset: 'month', from: '2026-09-01', to: '2026-09-30' }, today)).toBeFalse();
    expect(canShiftForward({ preset: 'month', from: '2026-08-01', to: '2026-08-31' }, today)).toBeTrue();
    expect(canShiftForward(presetRange('all', today), today)).toBeFalse();
  });

  it('computes the previous period of equal length', () => {
    expect(previousRange({ preset: 'month', from: '2026-09-01', to: '2026-09-30' })).toEqual({ preset: 'custom', from: '2026-08-02', to: '2026-08-31' });
  });

  it('labels full months by name and other ranges with dates', () => {
    expect(rangeLabel({ preset: 'month', from: '2026-09-01', to: '2026-09-30' })).toContain('2026');
    expect(rangeLabel(presetRange('all', today))).toContain('All time');
  });

  it('starts the all-time range at the first transaction', () => {
    expect(presetRange('all', today, '2022-10-27')).toEqual({
      preset: 'all',
      from: '2022-10-27',
      to: '2026-09-30',
    });
  });

  it('never starts all-time earlier than the API limit or later than today', () => {
    expect(
      daysInRange(presetRange('all', today, '2001-01-01')),
    ).toBeLessThanOrEqual(3660);
    expect(presetRange('all', today, '2030-01-01').from).toBe('2026-09-30');
  });

  it('chooses a readable chart granularity', () => {
    expect(autoGranularity({ from: '2026-09-01', to: '2026-09-30' })).toBe(
      'Day',
    );
    expect(autoGranularity({ from: '2026-01-01', to: '2026-06-30' })).toBe(
      'Week',
    );
    expect(autoGranularity({ from: '2025-01-01', to: '2026-09-30' })).toBe(
      'Month',
    );
    expect(autoGranularity({ from: '2020-01-01', to: '2026-09-30' })).toBe(
      'Quarter',
    );
  });

  it('adds months without overflowing short months', () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
  });
});
