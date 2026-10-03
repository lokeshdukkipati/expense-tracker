import {
  AnomalyDto, BudgetStatusDto, CategoryAmountDto, ForecastDto, PatternsDto, RecurringExpenseDto, SummaryDto, TopDescriptionDto, TrendPointDto,
} from '../models/api.models';
import { clamp } from '../utils/format';

/* ====================================================================== Financial health score */

export interface HealthInput {
  savingsRatePercent: number | null;
  budgets: readonly BudgetStatusDto[];
  /** Expenses of the last complete months, oldest first. */
  monthlyExpenses: readonly number[];
  recurringMonthlyCost: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  /** Sum of account balances. */
  balance: number | null;
}

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthResult {
  score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs attention';
  components: HealthComponent[];
}

const mean = (values: readonly number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * 0-100 score from five habits: saving, sticking to budgets, steady spending, a light recurring burden and cash runway.
 * Components without enough data are left out and the remaining weights are rescaled, so new users are not punished.
 */
export function healthScore(input: HealthInput): HealthResult | null {
  const components: HealthComponent[] = [];

  if (input.savingsRatePercent !== null) {
    const rate = input.savingsRatePercent;
    components.push({
      key: 'saving', label: 'Saving rate', weight: 30, score: clamp((rate / 20) * 100, 0, 100),
      detail: rate >= 20 ? `Saving ${rate.toFixed(0)}% of income` : rate >= 0 ? `Saving ${rate.toFixed(0)}%; aim for 20%+` : 'Spending more than you earn',
    });
  }

  if (input.budgets.length > 0) {
    const points = input.budgets.map((b) => (b.state === 'OnTrack' ? 100 : b.state === 'Warning' ? 60 : 0));
    const exceeded = input.budgets.filter((b) => b.state === 'Exceeded').length;
    components.push({
      key: 'budgets', label: 'Budget discipline', weight: 20, score: mean(points),
      detail: exceeded === 0 ? 'Within every budget' : `${exceeded} budget${exceeded > 1 ? 's' : ''} exceeded`,
    });
  }

  if (input.monthlyExpenses.length >= 3) {
    const avg = mean(input.monthlyExpenses);
    const cv = avg > 0 ? stdDev(input.monthlyExpenses) / avg : 0;
    components.push({
      key: 'stability', label: 'Spending stability', weight: 15, score: clamp(100 - (cv / 0.5) * 100, 0, 100),
      detail: cv < 0.15 ? 'Very predictable month to month' : cv < 0.35 ? 'Some month-to-month swings' : 'Large month-to-month swings',
    });
  }

  if (input.avgMonthlyIncome > 0) {
    const ratio = input.recurringMonthlyCost / input.avgMonthlyIncome;
    components.push({
      key: 'recurring', label: 'Fixed-cost burden', weight: 15, score: clamp(100 - ((ratio - 0.1) / 0.3) * 100, 0, 100),
      detail: `${(ratio * 100).toFixed(0)}% of income goes to recurring payments`,
    });
  }

  if (input.balance !== null && input.avgMonthlyExpense > 0) {
    const months = input.balance / input.avgMonthlyExpense;
    components.push({
      key: 'runway', label: 'Cash runway', weight: 20, score: clamp((months / 6) * 100, 0, 100),
      detail: months >= 6 ? `${months.toFixed(1)} months covered` : months > 0 ? `${months.toFixed(1)} months covered; aim for 6` : 'No cash buffer',
    });
  }

  if (components.length === 0) return null;

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs attention';
  return { score, grade, components: components.map((c) => ({ ...c, score: Math.round(c.score) })) };
}

/* ====================================================================== Spending pace */

export interface PaceResult {
  labels: string[];
  current: (number | null)[];
  previous: number[];
  /** Positive = spending more than at the same point last month. */
  deltaToDate: number;
  dayOfMonth: number;
}

/** Cumulative spend by day of month: this month so far versus all of last month. */
export function spendingPace(currentDays: readonly TrendPointDto[], previousDays: readonly TrendPointDto[], dayOfMonth: number): PaceResult {
  const length = Math.max(currentDays.length, previousDays.length, dayOfMonth);
  const cumulative = (days: readonly TrendPointDto[]): number[] => {
    let sum = 0;
    return Array.from({ length }, (_, i) => {
      sum += days[i]?.expense ?? 0;
      return sum;
    });
  };

  const cur = cumulative(currentDays);
  const prev = cumulative(previousDays);
  const idx = Math.min(length, Math.max(1, dayOfMonth)) - 1;

  return {
    labels: Array.from({ length }, (_, i) => String(i + 1)),
    current: cur.map((v, i) => (i < dayOfMonth ? v : null)),
    previous: prev,
    deltaToDate: (cur[idx] ?? 0) - (prev[idx] ?? 0),
    dayOfMonth,
  };
}

/* ====================================================================== Payday effect */

export interface PaydayEffect {
  paydays: number;
  afterAvg: number;
  baselineAvg: number;
  /** afterAvg / baselineAvg: 1.5 means 50% more spending in the 3 days after income lands. */
  ratio: number;
}

/** Compares daily spending in the 3 days after a large income day with every other day. */
export function paydayEffect(days: readonly TrendPointDto[]): PaydayEffect | null {
  if (days.length < 14) return null;

  const maxIncome = Math.max(0, ...days.map((d) => d.income));
  if (maxIncome <= 0) return null;

  const paydayIdx = days.map((d, i) => (d.income >= maxIncome * 0.5 ? i : -1)).filter((i) => i >= 0);
  const inWindow = new Set<number>();
  const afterValues: number[] = [];

  for (const i of paydayIdx) {
    inWindow.add(i);
    for (let k = 1; k <= 3; k++) {
      if (i + k < days.length) {
        inWindow.add(i + k);
        afterValues.push(days[i + k].expense);
      }
    }
  }

  const baseline = days.filter((_, i) => !inWindow.has(i)).map((d) => d.expense);
  if (afterValues.length === 0 || baseline.length < 7) return null;

  const afterAvg = mean(afterValues);
  const baselineAvg = mean(baseline);
  if (baselineAvg <= 0) return null;
  return { paydays: paydayIdx.length, afterAvg, baselineAvg, ratio: afterAvg / baselineAvg };
}

/* ====================================================================== No-spend days */

export interface NoSpendStats {
  noSpendDays: number;
  elapsedDays: number;
  currentStreak: number;
  longestStreak: number;
}

export function noSpendStats(days: readonly TrendPointDto[], today: string): NoSpendStats {
  const elapsed = days.filter((d) => d.periodStart <= today);
  let longest = 0;
  let run = 0;
  for (const d of elapsed) {
    run = d.expense <= 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { noSpendDays: elapsed.filter((d) => d.expense <= 0).length, elapsedDays: elapsed.length, currentStreak: run, longestStreak: longest };
}

/* ====================================================================== Weekend vs weekday */

export interface WeekendSplit {
  weekendAvg: number;
  weekdayAvg: number;
  ratio: number;
}

export function weekendSplit(patterns: PatternsDto): WeekendSplit | null {
  const avg = (names: string[]): number => {
    const items = patterns.byWeekday.filter((d) => names.includes(d.day));
    return mean(items.map((d) => d.averagePerDay));
  };
  const weekendAvg = avg(['Saturday', 'Sunday']);
  const weekdayAvg = avg(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  return weekdayAvg > 0 ? { weekendAvg, weekdayAvg, ratio: weekendAvg / weekdayAvg } : null;
}

/* ====================================================================== Micro-spend leak */

export interface MicroSpend {
  items: TopDescriptionDto[];
  total: number;
  sharePercent: number;
  threshold: number;
}

/** Small, frequent purchases that quietly add up (the "latte factor"). */
export function microSpend(top: readonly TopDescriptionDto[], summary: SummaryDto): MicroSpend | null {
  if (summary.transactionCount < 10 || summary.expense <= 0) return null;

  const averageTxn = summary.expense / summary.transactionCount;
  const threshold = averageTxn * 0.4;
  const items = top.filter((t) => t.count >= 3 && t.average <= threshold).sort((a, b) => b.total - a.total).slice(0, 6);
  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.total, 0);
  return { items, total, sharePercent: (total / summary.expense) * 100, threshold };
}

/* ====================================================================== Lifestyle inflation */

export interface LifestyleInflation {
  expenseGrowth: number;
  incomeGrowth: number;
  verdict: 'inflating' | 'steady' | 'healthy';
}

/** Last 3 full months versus the 3 before: is spending growing faster than income? */
export function lifestyleInflation(months: readonly TrendPointDto[]): LifestyleInflation | null {
  if (months.length < 6) return null;
  const recent = months.slice(-3);
  const before = months.slice(-6, -3);

  const growth = (now: number, then: number): number => (then > 0 ? ((now - then) / then) * 100 : 0);
  const expenseGrowth = growth(mean(recent.map((m) => m.expense)), mean(before.map((m) => m.expense)));
  const incomeGrowth = growth(mean(recent.map((m) => m.income)), mean(before.map((m) => m.income)));

  const verdict = expenseGrowth > incomeGrowth + 3 ? 'inflating' : expenseGrowth <= incomeGrowth ? 'healthy' : 'steady';
  return { expenseGrowth, incomeGrowth, verdict };
}

/* ====================================================================== Safe to spend */

export interface SafeToSpend {
  perDay: number;
  remaining: number;
  daysLeft: number;
  basis: 'budget' | 'average';
}

export function safeToSpend(budgets: readonly BudgetStatusDto[], forecast: ForecastDto | null): SafeToSpend | null {
  const overall = budgets.find((b) => b.budget.categoryId === null && b.budget.period === 'Monthly');
  if (overall) {
    const daysLeft = overall.daysLeft + 1;
    return { perDay: Math.max(0, overall.remaining) / daysLeft, remaining: overall.remaining, daysLeft, basis: 'budget' };
  }

  if (forecast && forecast.trailingMonthlyAverage > 0) {
    const daysLeft = forecast.daysRemaining + 1;
    const remaining = forecast.trailingMonthlyAverage - forecast.spentSoFar;
    return { perDay: Math.max(0, remaining) / daysLeft, remaining, daysLeft, basis: 'average' };
  }
  return null;
}

/* ====================================================================== Runway & work-days */

export const runwayDays = (balance: number, avgDailyExpense: number): number | null =>
  avgDailyExpense > 0 && balance > 0 ? balance / avgDailyExpense : null;

export interface WorkdayCost {
  name: string;
  color: string | null;
  days: number;
  amount: number;
}

/** How many days of income each category consumes in the period. */
export function categoryWorkdays(categories: readonly CategoryAmountDto[], income: number, periodDays: number): WorkdayCost[] {
  const dailyIncome = income / Math.max(1, periodDays);
  if (dailyIncome <= 0) return [];
  return categories.slice(0, 6).map((c) => ({ name: c.name, color: c.color, amount: c.amount, days: c.amount / dailyIncome }));
}

/* ====================================================================== Persona */

export interface Persona {
  title: string;
  description: string;
  traits: string[];
}

export function spendingPersona(patterns: PatternsDto | null, weekend: WeekendSplit | null): Persona | null {
  if (!patterns) return null;
  const total = patterns.byHour.reduce((s, h) => s + h.total, 0);
  if (total <= 0) return null;

  const share = (from: number, to: number): number =>
    patterns.byHour.filter((h) => h.hour >= from && h.hour <= to).reduce((s, h) => s + h.total, 0) / total;

  const night = share(21, 23) + share(0, 4);
  const morning = share(5, 11);
  const midday = share(12, 16);
  const evening = share(17, 20);

  const traits: string[] = [];
  let title = 'The Steady Spender';
  let description = 'Your spending is spread evenly through the day.';

  const best = Math.max(night, morning, midday, evening);
  if (best >= 0.4) {
    if (best === night) { title = 'The Night Owl'; description = 'Most of your spending happens late in the evening.'; }
    else if (best === morning) { title = 'The Early Bird'; description = 'You do most of your spending before noon.'; }
    else if (best === midday) { title = 'The Lunch-Hour Spender'; description = 'Your wallet opens most in the afternoon.'; }
    else { title = 'The After-Work Spender'; description = 'Your spending peaks after the workday ends.'; }
  }

  if (weekend) {
    if (weekend.ratio >= 1.4) traits.push(`Spends ${((weekend.ratio - 1) * 100).toFixed(0)}% more per day on weekends`);
    else if (weekend.ratio <= 0.8) traits.push('Weekdays cost more than weekends');
    else traits.push('Weekdays and weekends are balanced');
  }
  return { title, description, traits };
}

/* ====================================================================== Insight feed */

export interface Insight {
  tone: 'good' | 'warn' | 'bad' | 'info';
  icon: 'trending-up' | 'trending-down' | 'alert-triangle' | 'sparkles' | 'target' | 'repeat' | 'zap' | 'flame' | 'award' | 'info';
  title: string;
  text: string;
}

export interface InsightContext {
  summary: SummaryDto | null;
  categories: readonly CategoryAmountDto[];
  budgets: readonly BudgetStatusDto[];
  anomalies: readonly AnomalyDto[];
  recurring: readonly RecurringExpenseDto[];
  payday: PaydayEffect | null;
  noSpend: NoSpendStats | null;
  forecast: ForecastDto | null;
  money: (n: number) => string;
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const { summary, money } = ctx;

  if (summary) {
    const change = summary.expenseChangePercent;
    if (change !== null && Math.abs(change) >= 5 && summary.previous.expense > 0) {
      out.push(change > 0
        ? { tone: 'warn', icon: 'trending-up', title: `Spending is up ${change.toFixed(0)}%`, text: `${money(summary.expense)} versus ${money(summary.previous.expense)} in the previous period.` }
        : { tone: 'good', icon: 'trending-down', title: `Spending is down ${Math.abs(change).toFixed(0)}%`, text: `You spent ${money(summary.previous.expense - summary.expense)} less than in the previous period.` });
    }

    const rate = summary.savingsRatePercent;
    if (rate !== null) {
      if (rate >= 20) out.push({ tone: 'good', icon: 'award', title: `Saving ${rate.toFixed(0)}% of income`, text: 'You are above the 20% rule of thumb. Keep it up.' });
      else if (rate < 0) out.push({ tone: 'bad', icon: 'alert-triangle', title: 'Spending exceeds income', text: `You spent ${money(summary.expense - summary.income)} more than you earned in this period.` });
      else if (rate < 10) out.push({ tone: 'warn', icon: 'target', title: `Saving only ${rate.toFixed(0)}%`, text: 'Trimming one big category could lift this towards 20%.' });
    }
  }

  const top = ctx.categories[0];
  if (top && summary && summary.expense > 0 && top.percent >= 30) {
    out.push({ tone: 'info', icon: 'sparkles', title: `${top.name} is ${top.percent.toFixed(0)}% of spending`, text: `${money(top.amount)} across ${top.count} transactions, your biggest category.` });
  }

  for (const b of ctx.budgets.filter((x) => x.state === 'Exceeded').slice(0, 2)) {
    out.push({ tone: 'bad', icon: 'alert-triangle', title: `${b.budget.categoryName ?? 'Overall'} budget exceeded`, text: `${money(b.spent)} spent against a ${money(b.budget.amount)} limit.` });
  }
  for (const b of ctx.budgets.filter((x) => x.state === 'OnTrack' && x.projectedToExceed).slice(0, 1)) {
    out.push({ tone: 'warn', icon: 'target', title: `${b.budget.categoryName ?? 'Overall'} budget on course to overshoot`, text: `Projected ${money(b.projectedSpend)} by the end of the period.` });
  }

  if (ctx.anomalies.length > 0) {
    const a = ctx.anomalies[0];
    out.push({ tone: 'warn', icon: 'zap', title: `Unusual ${a.categoryName} expense`, text: `${money(a.amount)}${a.description ? ` (${a.description})` : ''} is ${a.zScore.toFixed(1)}x the usual spread for this category.` });
  }

  if (ctx.recurring.length > 0) {
    const total = ctx.recurring.reduce((s, r) => s + r.monthlyCost, 0);
    out.push({ tone: 'info', icon: 'repeat', title: `${ctx.recurring.length} recurring payment${ctx.recurring.length > 1 ? 's' : ''}`, text: `About ${money(total)} per month is committed before you decide anything.` });
  }

  if (ctx.payday && ctx.payday.ratio >= 1.25) {
    out.push({ tone: 'warn', icon: 'zap', title: 'Payday spending spike', text: `You spend ${((ctx.payday.ratio - 1) * 100).toFixed(0)}% more per day in the 3 days after income arrives.` });
  }

  if (ctx.noSpend && ctx.noSpend.currentStreak >= 2) {
    out.push({ tone: 'good', icon: 'flame', title: `${ctx.noSpend.currentStreak}-day no-spend streak`, text: `Your longest in this period is ${ctx.noSpend.longestStreak} days.` });
  }

  if (ctx.forecast && ctx.forecast.trailingMonthlyAverage > 0) {
    const diff = ctx.forecast.projectedMonthEnd - ctx.forecast.trailingMonthlyAverage;
    const pct = (diff / ctx.forecast.trailingMonthlyAverage) * 100;
    if (Math.abs(pct) >= 10) {
      out.push(pct > 0
        ? { tone: 'warn', icon: 'trending-up', title: 'This month is heading higher', text: `Projected ${money(ctx.forecast.projectedMonthEnd)}, ${pct.toFixed(0)}% above your recent monthly average.` }
        : { tone: 'good', icon: 'trending-down', title: 'This month is heading lower', text: `Projected ${money(ctx.forecast.projectedMonthEnd)}, ${Math.abs(pct).toFixed(0)}% below your recent monthly average.` });
    }
  }

  return out;
}
