import {
  AchievementsDto,
  CategoryComparisonDto,
  PatternsDto,
  SummaryDto,
} from '../../core/models/api.models';
import { formatDate, formatMoney } from '../../core/utils/format';
import { StoryCard } from '../../shared/ui/story-viewer.component';

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

/**
 * Turns the numbers into a handful of plain-English story cards ("Food is up 22% on before").
 * No AI involved: every sentence is a template filled with the user's own figures, so it is free, instant and
 * always consistent with the analytics. Cards with nothing to say are simply left out.
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
    icon: 'sparkles',
  });

  if (s.expenseChangePercent !== null && s.previous.expense > 0) {
    const percent = Math.abs(Math.round(s.expenseChangePercent));
    if (percent > 0) {
      const less = s.expenseChangePercent < 0;
      cards.push({
        id: 'change',
        kicker: `Compared with ${previousText}`,
        metric: `${less ? '-' : '+'}${percent}%`,
        metricLabel: less ? 'less spending' : 'more spending',
        title: less
          ? 'You are spending less than in the previous period'
          : 'Spending is up on the previous period',
        body: `${money(s.expense)} (${rangeText}) against ${money(s.previous.expense)} (${previousText}).`,
        tone: less ? 'success' : 'warning',
        icon: less ? 'trending-down' : 'trending-up',
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
        ? `, ${Math.abs(Math.round(top.changePercent))}% ${top.changePercent > 0 ? 'more' : 'less'} than before`
        : '';
    cards.push({
      id: 'top-category',
      kicker: 'Biggest category',
      metric: money(top.current),
      metricLabel: `${share}% of your spending`,
      title: `${top.name} leads your spending`,
      body: `You have spent ${money(top.current)} on ${top.name}${trend}.`,
      tone: 'info',
      icon: 'pie-slice',
    });
  }

  const jump = [...comparison]
    .filter((c) => c.change > 0 && c.previous > 0)
    .sort((a, b) => b.change - a.change)[0];
if (jump && jump.categoryId !== top?.categoryId) {
  cards.push({
    id: 'jump',
    kicker: 'Biggest jump',
    metric: `+${money(jump.change)}`,
    metricLabel:
      jump.changePercent !== null
        ? `up ${Math.round(jump.changePercent)}% on before`
        : 'more than before',
    title: `${jump.name} grew the most`,
    body: `It was ${money(jump.previous)} in the previous period and is ${money(jump.current)} now.`,
    tone: 'warning',
    icon: 'trending-up',
  });
}

  const drop = [...comparison]
    .filter((c) => c.change < 0)
    .sort((a, b) => a.change - b.change)[0];
  if (drop) {
    cards.push({
      id: 'drop',
      kicker: 'Good news',
      metric: money(Math.abs(drop.change)),
      metricLabel: 'less than before',
      title: `You spent less on ${drop.name}`,
      body: `${money(drop.current)} now, against ${money(drop.previous)} in the previous period.`,
      tone: 'success',
      icon: 'trending-down',
    });
  }

  const weekdayTotals = patterns?.byWeekday ?? [];
  const spent = weekdayTotals.reduce((sum, d) => sum + d.total, 0);
  if (spent > 0) {
    const weekend = weekdayTotals
      .filter((d) => d.day === 'Saturday' || d.day === 'Sunday')
      .reduce((sum, d) => sum + d.total, 0);
    const weekendShare = Math.round((weekend / spent) * 100);
    // Two days of seven would be about 29%, so only call out clearly unusual splits.
    if (weekendShare >= 40) {
      cards.push({
        id: 'weekend',
        kicker: 'When you spend',
        metric: `${weekendShare}%`,
        metricLabel: 'of spending on Saturday and Sunday',
        title: 'Weekends drive your spending',
        body: 'Planning weekend treats ahead is the easiest place to save.',
        tone: 'warning',
        icon: 'calendar',
      });
    } else if (weekendShare <= 18) {
      cards.push({
        id: 'weekday',
        kicker: 'When you spend',
        metric: `${100 - weekendShare}%`,
        metricLabel: 'of spending Monday to Friday',
        title: 'Weekdays carry most of your spending',
        body: 'Work-week costs like food and travel are where your money goes.',
        tone: 'info',
        icon: 'calendar',
      });
    }
  }

  if (s.largestExpense) {
    cards.push({
      id: 'largest',
      kicker: 'Largest single expense',
      metric: money(s.largestExpense.amount),
      metricLabel: formatDate(s.largestExpense.occurredAt, 'short'),
      title: s.largestExpense.description || s.largestExpense.categoryName,
      body: `Category: ${s.largestExpense.categoryName}.`,
      tone: 'danger',
      icon: 'wallet',
    });
  }

  if (s.income > 0) {
    const rate = Math.round(
      s.savingsRatePercent ?? ((s.income - s.expense) / s.income) * 100,
    );
    cards.push({
      id: 'savings',
      kicker: 'Saving',
      metric: `${rate}%`,
      metricLabel: 'of your income kept',
      title:
        rate >= 20
          ? 'You are saving well'
          : rate >= 0
            ? 'You are keeping more than you spend'
            : 'You have spent more than you earned',
      body: `${money(s.income)} came in and ${money(s.expense)} went out.`,
      tone: rate >= 20 ? 'success' : rate >= 0 ? 'info' : 'danger',
      icon: 'percent',
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
        icon: 'flame',
      });
    } else if (achievements.noSpendDaysLast30 > 0) {
      cards.push({
        id: 'no-spend',
        kicker: 'Habit',
        metric: String(achievements.noSpendDaysLast30),
        metricLabel: 'no-spend days in the last 30',
        title: 'Days without spending add up',
        body: 'Every one of them is money kept.',
        tone: 'success',
        icon: 'leaf',
      });
    }
  }

  cards.push({
    id: 'outro',
    title: 'That is the story so far',
    body: 'Open Analytics for the full picture, or set a goal to put the savings to work.',
    tone: 'brand',
    icon: 'award',
  });

  // Keep the closing card; drop the least important middle cards if there are too many.
  if (cards.length > MAX_CARDS) {
    const outro = cards[cards.length - 1]!;
    return [...cards.slice(0, MAX_CARDS - 1), outro];
  }
  return cards;
}
