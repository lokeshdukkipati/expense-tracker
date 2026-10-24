import {
  AchievementsDto,
  CategoryComparisonDto,
  PatternsDto,
  SummaryDto,
} from '../../core/models/api.models';
import { StoryCard } from '../../core/services/story.service';
import { formatDate, formatMoney } from '../../core/utils/format';

export interface StoryInput {
  summary: SummaryDto;
  comparison: CategoryComparisonDto[];
  patterns: PatternsDto | null;
  achievements: AchievementsDto | null;
  currency: string;
  /** For example "October", or "recent" for the last 90 days. */
  periodLabel: string;
  /** True when the period is still running (this month so far). */
  isCurrent: boolean;
  /** The dates the story covers and the dates it is compared with, for example "1 Oct – 24 Oct". */
  rangeText: string;
  previousText: string;
}

const MAX_CARDS = 8;
const WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const WEEK_LETTER: Record<string, string> = {
  Monday: 'M',
  Tuesday: 'T',
  Wednesday: 'W',
  Thursday: 'T',
  Friday: 'F',
  Saturday: 'S',
  Sunday: 'S',
};
/** If there are too many cards, these go first. */
const FIRST_TO_DROP = ['drop', 'jump', 'streak', 'largest'];

/**
 * Turns the numbers into a handful of plain-English story cards, each with a matching picture.
 * No AI is involved: every sentence is a template filled with the user's own figures, so it is free, instant and
 * always consistent with the analytics. Cards with nothing to say are left out.
 */
export function buildMoneyStory(input: StoryInput): StoryCard[] {
  const {
    summary: s,
    comparison,
    patterns,
    achievements,
    currency,
    periodLabel,
    isCurrent,
    rangeText,
    previousText,
  } = input;
  if (s.transactionCount === 0 || s.income + s.expense === 0) return [];

  const money = (value: number): string =>
    formatMoney(value, currency, { compact: true });
  const ratio = (value: number, max: number): number =>
    max > 0 ? Math.max(0.04, Math.min(1, value / max)) : 0.04;
  const cards: StoryCard[] = [];

  cards.push({
    id: 'intro',
    kicker: rangeText,
    metric: money(s.expense),
    metricLabel: isCurrent ? 'spent so far' : 'spent',
    title: isCurrent
      ? `Here is how ${periodLabel} is going`
      : periodLabel === 'recent'
        ? 'Your last 90 days'
        : `Here is how ${periodLabel} went`,
    body: `${s.transactionCount} transactions, about ${money(s.averageDailyExpense)} a day.`,
    tone: 'brand',
  });

  if (s.expenseChangePercent !== null && s.previous.expense > 0) {
    const percent = Math.abs(Math.round(s.expenseChangePercent));
    if (percent > 0) {
      const less = s.expenseChangePercent < 0;
      const max = Math.max(s.expense, s.previous.expense);
      cards.push({
        id: 'change',
        kicker: `Compared with ${previousText}`,
        metric: `${less ? '-' : '+'}${percent}%`,
        metricLabel: less ? 'less spending' : 'more spending',
        title: less
          ? 'You are spending less than in the previous period'
          : 'Spending is up on the previous period',
        visual: {
          kind: 'rank',
          items: [
            {
              label: `Now · ${rangeText}`,
              text: money(s.expense),
              ratio: ratio(s.expense, max),
            },
            {
              label: `Before · ${previousText}`,
              text: money(s.previous.expense),
              ratio: ratio(s.previous.expense, max),
              muted: true,
            },
          ],
        },
        tone: less ? 'success' : 'warning',
      });
    }
  }

  const ranked = [...comparison]
    .filter((c) => c.current > 0)
    .sort((a, b) => b.current - a.current);
  const top = ranked[0];
  if (top && s.expense > 0) {
    const share = Math.round((top.current / s.expense) * 100);
    const trend =
      top.changePercent !== null && Math.abs(top.changePercent) >= 1
        ? ` That is ${Math.abs(Math.round(top.changePercent))}% ${top.changePercent > 0 ? 'more' : 'less'} than before.`
        : '';
    cards.push({
      id: 'top-category',
      kicker: 'Where it went',
      metric: `${share}%`,
      metricLabel: `of your spending went to ${top.name}`,
      title: `${top.name} leads your spending`,
      body: `${money(top.current)} in total.${trend}`,
      visual: {
        kind: 'rank',
        items: ranked
          .slice(0, 3)
          .map((c) => ({
            label: c.name,
            text: money(c.current),
            ratio: ratio(c.current, top.current),
          })),
      },
      tone: 'info',
    });
  }

  const jump = [...comparison]
    .filter((c) => c.change > 0 && c.previous > 0)
    .sort((a, b) => b.change - a.change)[0];
  if (jump && jump.categoryId !== top?.categoryId) {
    const max = Math.max(jump.current, jump.previous);
    cards.push({
      id: 'jump',
      kicker: 'Biggest jump',
      metric: `+${money(jump.change)}`,
      metricLabel:
        jump.changePercent !== null
          ? `up ${Math.round(jump.changePercent)}% on before`
          : 'more than before',
      title: `${jump.name} grew the most`,
      visual: {
        kind: 'rank',
        items: [
          {
            label: `Now · ${rangeText}`,
            text: money(jump.current),
            ratio: ratio(jump.current, max),
          },
          {
            label: `Before · ${previousText}`,
            text: money(jump.previous),
            ratio: ratio(jump.previous, max),
            muted: true,
          },
        ],
      },
      tone: 'warning',
    });
  }

  const drop = [...comparison]
    .filter((c) => c.change < 0)
    .sort((a, b) => a.change - b.change)[0];
  if (drop) {
    const max = Math.max(drop.current, drop.previous);
    cards.push({
      id: 'drop',
      kicker: 'Good news',
      metric: money(Math.abs(drop.change)),
      metricLabel: 'less than before',
      title: `You spent less on ${drop.name}`,
      visual: {
        kind: 'rank',
        items: [
          {
            label: `Now · ${rangeText}`,
            text: money(drop.current),
            ratio: ratio(drop.current, max),
          },
          {
            label: `Before · ${previousText}`,
            text: money(drop.previous),
            ratio: ratio(drop.previous, max),
            muted: true,
          },
        ],
      },
      tone: 'success',
    });
  }

  const byDay = patterns?.byWeekday ?? [];
  const busiest = [...byDay].sort(
    (a, b) => b.averagePerDay - a.averagePerDay,
  )[0];
  const spent = byDay.reduce((sum, d) => sum + d.total, 0);
  if (busiest && busiest.averagePerDay > 0 && spent > 0) {
    const weekend = byDay
      .filter((d) => d.day === 'Saturday' || d.day === 'Sunday')
      .reduce((sum, d) => sum + d.total, 0);
    const weekendShare = Math.round((weekend / spent) * 100);
    const maxAverage = busiest.averagePerDay;
    cards.push({
      id: 'week',
      kicker: 'Your week',
      metric: busiest.day,
      metricLabel: `is your biggest spending day, about ${money(busiest.averagePerDay)}`,
      title:
        weekendShare >= 40
          ? 'Weekends drive your spending'
          : weekendShare <= 18
            ? 'Weekdays carry most of your spending'
            : 'Your spending is spread across the week',
      body: `${weekendShare}% of what you spent was on a Saturday or Sunday.`,
      visual: {
        kind: 'week',
        days: WEEK.map((name) => {
          const day = byDay.find((d) => d.day === name);
          return {
            label: WEEK_LETTER[name] ?? '',
            ratio: ratio(day?.averagePerDay ?? 0, maxAverage),
            accent: name === 'Saturday' || name === 'Sunday',
          };
        }),
      },
      tone: 'info',
    });
  }

  if (s.largestExpense) {
    cards.push({
      id: 'largest',
      kicker: 'Largest single expense',
      title: 'The one that stood out',
      visual: {
        kind: 'receipt',
        title: s.largestExpense.description || s.largestExpense.categoryName,
        lines: [
          { label: 'Category', value: s.largestExpense.categoryName },
          {
            label: 'Date',
            value: formatDate(s.largestExpense.occurredAt, 'short'),
          },
        ],
        total: money(s.largestExpense.amount),
      },
      tone: 'danger',
    });
  }

  if (s.income > 0) {
    const rate = Math.round(
      s.savingsRatePercent ?? ((s.income - s.expense) / s.income) * 100,
    );
    cards.push({
      id: 'savings',
      kicker: 'Saving',
      title:
        rate >= 20
          ? 'You are saving well'
          : rate >= 0
            ? 'You are keeping more than you spend'
            : 'You have spent more than you earned',
      body: `${money(s.income)} came in and ${money(s.expense)} went out.`,
      visual: {
        kind: 'ring',
        percent: Math.max(0, Math.min(100, rate)),
        center: `${rate}%`,
        caption: 'of your income kept',
      },
      tone: rate >= 20 ? 'success' : rate >= 0 ? 'info' : 'danger',
      action:
        rate > 0 ? { label: 'Put it into a goal', link: '/goals' } : undefined,
    });
  }

  if (achievements) {
    if (achievements.logging.current >= 2) {
      cards.push({
        id: 'streak',
        kicker: 'Habit',
        metric: String(achievements.logging.current),
        metricLabel: 'days logged in a row',
        title: 'A habit is forming',
        body: `${achievements.noSpendDaysLast30} no-spend day${achievements.noSpendDaysLast30 === 1 ? '' : 's'} in the last 30 days.`,
        tone: 'success',
      });
    } else if (achievements.noSpendDaysLast30 > 0) {
      cards.push({
        id: 'streak',
        kicker: 'Habit',
        metric: String(achievements.noSpendDaysLast30),
        metricLabel: 'no-spend days in the last 30',
        title: 'Days without spending add up',
        body: 'Every one of them is money kept.',
        tone: 'success',
      });
    }
  }

  const outro: StoryCard = {
    id: 'outro',
    title: 'That is the story so far',
    body: 'Open Analytics for the full picture.',
    tone: 'brand',
    action: { label: 'Open analytics', link: '/analytics' },
  };

  for (const id of FIRST_TO_DROP) {
    if (cards.length + 1 <= MAX_CARDS) break;
    const at = cards.findIndex((c) => c.id === id);
    if (at >= 0) cards.splice(at, 1);
  }

  return [...cards.slice(0, MAX_CARDS - 1), outro];
}
