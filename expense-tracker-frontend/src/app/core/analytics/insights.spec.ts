import { BudgetStatusDto, PatternsDto, SummaryDto, TopDescriptionDto, TrendPointDto } from '../models/api.models';
import { healthScore, lifestyleInflation, microSpend, noSpendStats, paydayEffect, safeToSpend, spendingPace, weekendSplit } from './insights';

const day = (date: string, expense: number, income = 0): TrendPointDto => ({ periodStart: date, expense, income, net: income - expense, count: expense > 0 ? 1 : 0 });

const budget = (state: 'OnTrack' | 'Warning' | 'Exceeded', overrides: Partial<BudgetStatusDto> = {}): BudgetStatusDto => ({
  budget: { id: 'b', categoryId: null, categoryName: null, amount: 1000, currency: 'INR', period: 'Monthly', alertThresholdPercent: 80, isActive: true, version: 1 },
  periodStart: '2026-09-01', periodEnd: '2026-09-30', spent: 500, remaining: 500, percentUsed: 50, state, projectedSpend: 900, daysLeft: 9, projectedToExceed: false, ...overrides,
});

describe('healthScore', () => {
  const base = { savingsRatePercent: null, budgets: [], monthlyExpenses: [], recurringMonthlyCost: 0, avgMonthlyIncome: 0, avgMonthlyExpense: 0, balance: null };

  it('returns null when there is nothing to score', () => {
    expect(healthScore(base)).toBeNull();
  });

  it('rewards a 20% savings rate with full marks on that component', () => {
    const result = healthScore({ ...base, savingsRatePercent: 25 });
    expect(result?.score).toBe(100);
    expect(result?.grade).toBe('Excellent');
  });

  it('penalises overspending and exceeded budgets', () => {
    const result = healthScore({ ...base, savingsRatePercent: -10, budgets: [budget('Exceeded')] });
    expect(result?.score).toBe(0);
    expect(result?.grade).toBe('Needs attention');
  });

  it('rescales weights when some components are missing', () => {
    const only = healthScore({ ...base, savingsRatePercent: 10 });
    expect(only?.components.length).toBe(1);
    expect(only?.score).toBe(50);
  });

  it('scores stable spending higher than erratic spending', () => {
    const stable = healthScore({ ...base, monthlyExpenses: [100, 102, 98, 101] });
    const erratic = healthScore({ ...base, monthlyExpenses: [10, 300, 20, 400] });
    expect(stable!.score).toBeGreaterThan(erratic!.score);
  });

  it('measures cash runway against six months', () => {
    const result = healthScore({ ...base, balance: 3000, avgMonthlyExpense: 1000 });
    expect(result?.score).toBe(50);
  });
});

describe('spendingPace', () => {
  it('accumulates spend and reports the gap to last month at the same day', () => {
    const current = [day('2026-09-01', 100), day('2026-09-02', 100), day('2026-09-03', 0)];
    const previous = [day('2026-08-01', 50), day('2026-08-02', 50), day('2026-08-03', 50), day('2026-08-04', 50)];
    const pace = spendingPace(current, previous, 2);
    expect(pace.current).toEqual([100, 200, null, null]);
    expect(pace.previous).toEqual([50, 100, 150, 200]);
    expect(pace.deltaToDate).toBe(100);
  });
});

describe('paydayEffect', () => {
  it('detects higher spending right after income', () => {
    const days: TrendPointDto[] = Array.from({ length: 30 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, 100));
    days[9] = day('2026-09-10', 100, 50000);
    days[10] = day('2026-09-11', 400);
    days[11] = day('2026-09-12', 400);
    days[12] = day('2026-09-13', 400);
    const result = paydayEffect(days);
    expect(result?.paydays).toBe(1);
    expect(result!.ratio).toBeGreaterThan(3);
  });

  it('needs at least two weeks and some income', () => {
    expect(paydayEffect([day('2026-09-01', 100, 100)])).toBeNull();
    expect(paydayEffect(Array.from({ length: 20 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, 10)))).toBeNull();
  });
});

describe('noSpendStats', () => {
  it('counts no-spend days and streaks up to today only', () => {
    const days = [day('2026-09-01', 10), day('2026-09-02', 0), day('2026-09-03', 0), day('2026-09-04', 5), day('2026-09-05', 0), day('2026-09-06', 0), day('2026-09-07', 0)];
    const stats = noSpendStats(days, '2026-09-06');
    expect(stats).toEqual({ noSpendDays: 4, elapsedDays: 6, currentStreak: 2, longestStreak: 2 });
  });
});

describe('weekendSplit', () => {
  const patterns = (weekday: number, weekend: number): PatternsDto => ({
    byHour: [],
    byWeekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => ({
      day: d as PatternsDto['byWeekday'][number]['day'], total: 0, count: 0, averagePerDay: d === 'Saturday' || d === 'Sunday' ? weekend : weekday,
    })),
  });

  it('compares average weekend and weekday days', () => {
    expect(weekendSplit(patterns(100, 150))?.ratio).toBeCloseTo(1.5);
  });

  it('returns null when weekdays have no spending', () => {
    expect(weekendSplit(patterns(0, 100))).toBeNull();
  });
});

describe('microSpend', () => {
  const summary = { expense: 10000, transactionCount: 100 } as SummaryDto;
  const item = (description: string, count: number, average: number): TopDescriptionDto => ({ description, count, average, total: count * average, lastOccurredAt: '2026-09-01T00:00:00Z' });

  it('flags frequent purchases far below the average transaction', () => {
    const result = microSpend([item('Chai', 20, 20), item('Rent', 1, 8000), item('Gift', 2, 30)], summary);
    expect(result?.items.map((i) => i.description)).toEqual(['Chai']);
    expect(result?.sharePercent).toBeCloseTo(4);
  });

  it('needs enough transactions to be meaningful', () => {
    expect(microSpend([item('Chai', 20, 20)], { expense: 100, transactionCount: 5 } as SummaryDto)).toBeNull();
  });
});

describe('lifestyleInflation', () => {
  const month = (i: number, income: number, expense: number): TrendPointDto => day(`2026-0${i}-01`, expense, income);

  it('flags spending that grows faster than income', () => {
    const result = lifestyleInflation([month(1, 100, 100), month(2, 100, 100), month(3, 100, 100), month(4, 100, 130), month(5, 100, 130), month(6, 100, 130)]);
    expect(result?.verdict).toBe('inflating');
    expect(result?.expenseGrowth).toBeCloseTo(30);
  });

  it('is healthy when income keeps up', () => {
    const result = lifestyleInflation([month(1, 100, 100), month(2, 100, 100), month(3, 100, 100), month(4, 130, 120), month(5, 130, 120), month(6, 130, 120)]);
    expect(result?.verdict).toBe('healthy');
  });

  it('needs six months of history', () => {
    expect(lifestyleInflation([month(1, 100, 100)])).toBeNull();
  });
});

describe('safeToSpend', () => {
  it('uses the overall monthly budget when there is one', () => {
    const result = safeToSpend([budget('OnTrack', { remaining: 900, daysLeft: 8 })], null);
    expect(result).toEqual({ perDay: 100, remaining: 900, daysLeft: 9, basis: 'budget' });
  });

  it('never goes negative', () => {
    expect(safeToSpend([budget('Exceeded', { remaining: -50, daysLeft: 3 })], null)?.perDay).toBe(0);
  });

  it('returns null without a budget or a forecast', () => {
    expect(safeToSpend([], null)).toBeNull();
  });
});
