import { TransactionType } from '../models/api.models';

export interface QuickEntryContext {
  /** Defaults to the current time. */
  now?: Date;
  accounts: readonly { id: string; name: string }[];
  categories: readonly {
    id: string;
    name: string;
    type: TransactionType;
    parentName: string | null;
  }[];
}

export interface QuickEntry {
  amount: number | null;
  type: TransactionType;
  /** What is left of the sentence after the amount, date, account and tags are taken out. */
  description: string;
  date: Date;
  /** The words that set the date ("yesterday"), or null when none were found. */
  dateText: string | null;
  accountId: string | null;
  categoryId: string | null;
  tags: string[];
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const INCOME_WORDS =
  /\b(salary|salaries|received|refund|refunded|cashback|bonus|interest|dividend|credited|earned|income|payout|reimbursement|reimbursed|got paid|sold)\b/i;
const MONTH_NAMES =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const AMOUNT =
  /(?:(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*)?(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|k)?(?![\w])/gi;
const FILLER =
  '(?:for|on|at|to|of|from|in|via|using|with|by|paid|spent|bought|got)';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month, day);
  return d.getFullYear() === year &&
    d.getMonth() === month &&
    d.getDate() === day
    ? d
    : null;
}

/** Removes the first match of a pattern (a pattern without the g flag) and reports what matched. */
function take(
  source: string,
  pattern: RegExp,
): { rest: string; match: RegExpExecArray | null } {
  const match = pattern.exec(source);
  if (!match) return { rest: source, match: null };
  return {
    rest: `${source.slice(0, match.index)} ${source.slice(match.index + match[0].length)}`,
    match,
  };
}

/** Removes a whole word or phrase (and a preposition just before it), without needing look-behind support. */
function takePhrase(
  source: string,
  phrase: string,
): { rest: string; found: boolean } {
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])((?:(?:from|via|using|with|in|by|through|on)\\s+)?${escapeRegExp(phrase)})(?![\\p{L}\\p{N}])`,
    'iu',
  );
  const match = pattern.exec(source);
  if (!match) return { rest: source, found: false };
  const start = match.index + (match[1] ?? '').length;
  return {
    rest: `${source.slice(0, start)} ${source.slice(match.index + match[0].length)}`,
    found: true,
  };
}

function resolveMonthDay(
  today: Date,
  day: number,
  monthName: string,
  year?: string,
): Date | null {
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const y = year ? Number(year) : today.getFullYear();
  let result = validDate(y, month, day);
  // "25 dec" typed in October means last December.
  if (result && !year && result > today) result = validDate(y - 1, month, day);
  return result;
}

function takeDate(
  source: string,
  now: Date,
): { rest: string; date: Date | null; text: string | null } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const found = (rest: string, match: RegExpExecArray, date: Date) => ({
    rest,
    date,
    text: match[0].trim(),
  });

  let r = take(source, /\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (r.match) {
    const d = validDate(
      Number(r.match[1]),
      Number(r.match[2]) - 1,
      Number(r.match[3]),
    );
    if (d) return found(r.rest, r.match, d);
  }

  r = take(source, /\bday before yesterday\b/i);
  if (r.match) return found(r.rest, r.match, addDays(today, -2));

  r = take(source, /\b(\d{1,3})\s*days?\s*ago\b/i);
  if (r.match)
    return found(r.rest, r.match, addDays(today, -Number(r.match[1])));

  r = take(source, /\b(?:yesterday|last night)\b/i);
  if (r.match) return found(r.rest, r.match, addDays(today, -1));

  r = take(source, /\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i);
  if (r.match) return found(r.rest, r.match, today);

  r = take(
    source,
    /\b(?:(last|on|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b/i,
  );
  if (r.match) {
    const index = WEEKDAYS.indexOf(
      (r.match[2] ?? '').slice(0, 3).toLowerCase(),
    );
    if (index >= 0) {
      let back = (today.getDay() - index + 7) % 7;
      if (back === 0 && (r.match[1] ?? '').toLowerCase() === 'last') back = 7;
      return found(r.rest, r.match, addDays(today, -back));
    }
  }

  r = take(
    source,
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAMES}\\b(?:\\s+(\\d{4}))?`,
      'i',
    ),
  );
  if (r.match) {
    const d = resolveMonthDay(
      today,
      Number(r.match[1]),
      r.match[2] ?? '',
      r.match[3],
    );
    if (d) return found(r.rest, r.match, d);
  }

  r = take(
    source,
    new RegExp(
      `\\b${MONTH_NAMES}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`,
      'i',
    ),
  );
  if (r.match) {
    const d = resolveMonthDay(
      today,
      Number(r.match[2]),
      r.match[1] ?? '',
      r.match[3],
    );
    if (d) return found(r.rest, r.match, d);
  }

  // 5/10 or 05-10-2026: day first, as written in India.
  r = take(source, /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (r.match) {
    const year = r.match[3]
      ? r.match[3].length === 2
        ? 2000 + Number(r.match[3])
        : Number(r.match[3])
      : today.getFullYear();
    let d = validDate(year, Number(r.match[2]) - 1, Number(r.match[1]));
    if (d && !r.match[3] && d > today)
      d = validDate(year - 1, Number(r.match[2]) - 1, Number(r.match[1]));
    if (d) return found(r.rest, r.match, d);
  }

  return { rest: source, date: null, text: null };
}

/**
 * Turns a sentence such as "coffee 180 yesterday", "salary 65k" or "paid 1,200 to Ravi for rent from Cash #pg"
 * into a transaction draft. Pure and forgiving: whatever it cannot find stays empty, and the caller shows it
 * so the user can correct it.
 */
export function parseQuickEntry(
  input: string,
  ctx: QuickEntryContext,
): QuickEntry {
  const now = ctx.now ?? new Date();
  const startsWithPlus = input.trim().startsWith('+');
  let work = ` ${input.replace(/\s+/g, ' ').trim()} `;

  // #tags
  const tags: string[] = [];
  work = work.replace(
    /(?:^|\s)#([\p{L}\p{N}_-]{1,30})/gu,
    (_all, tag: string) => {
      const lower = tag.toLowerCase();
      if (tags.length < 10 && !tags.includes(lower)) tags.push(lower);
      return ' ';
    },
  );

  // Time: "at 3pm", "9:30 am", "at 15:30".
  let hour: number | null = null;
  let minute = 0;
  const twelveHour = take(
    work,
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (twelveHour.match) {
    const h = Number(twelveHour.match[1]);
    const m = Number(twelveHour.match[2] ?? 0);
    if (h >= 1 && h <= 12 && m < 60) {
      hour =
        (h % 12) +
        ((twelveHour.match[3] ?? '').toLowerCase() === 'pm' ? 12 : 0);
      minute = m;
      work = twelveHour.rest;
    }
  } else {
    const twentyFour = take(work, /\bat\s+(\d{1,2}):(\d{2})\b/i);
    if (twentyFour.match) {
      const h = Number(twentyFour.match[1]);
      const m = Number(twentyFour.match[2]);
      if (h < 24 && m < 60) {
        hour = h;
        minute = m;
        work = twentyFour.rest;
      }
    }
  }

  // Date
  const dateResult = takeDate(work, now);
  work = dateResult.rest;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const base = dateResult.date ?? today;
  const isToday = base.getTime() === today.getTime();
  const date = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hour ?? (isToday ? now.getHours() : 12),
    hour !== null ? minute : isToday ? now.getMinutes() : 0,
  );

  // Amount: a number with a currency symbol wins; otherwise the largest number ("dinner for 2 800" means 800).
  const candidates: {
    value: number;
    symbol: boolean;
    start: number;
    end: number;
  }[] = [];
  for (const m of work.matchAll(AMOUNT)) {
    let value = Number((m[2] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const suffix = (m[3] ?? '').toLowerCase();
    if (suffix === 'k') value *= 1_000;
    else if (suffix.startsWith('l')) value *= 100_000;
    else if (suffix.startsWith('cr')) value *= 10_000_000;
    if (value <= 0 || value > 1_000_000_000_000) continue;
    const start = m.index ?? 0;
    candidates.push({
      value: round2(value),
      symbol: !!m[1],
      start,
      end: start + m[0].length,
    });
  }
  candidates.sort(
    (a, b) => (b.symbol ? 1 : 0) - (a.symbol ? 1 : 0) || b.value - a.value,
  );
  const best = candidates[0];
  let amount: number | null = null;
  if (best) {
    amount = best.value;
    work = `${work.slice(0, best.start)} ${work.slice(best.end)}`;
  }

  // Account: any account whose name appears in the sentence (longest name first).
  let accountId: string | null = null;
  for (const account of [...ctx.accounts].sort(
    (a, b) => b.name.length - a.name.length,
  )) {
    const name = account.name.trim();
    if (name.length === 0) continue;
    const taken = takePhrase(work, name);
    if (taken.found) {
      accountId = account.id;
      work = taken.rest;
      break;
    }
  }

  // Type
  const type: TransactionType =
    startsWithPlus || INCOME_WORDS.test(work) ? 'Income' : 'Expense';

  // Category: a category (or subcategory) whose name appears as a word, preferring the longest and most specific.
  let categoryId: string | null = null;
  let categoryScore = 0;
  for (const category of ctx.categories) {
    if (category.type !== type || category.name.trim().length < 3) continue;
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(category.name.trim())}(?![\\p{L}\\p{N}])`,
      'iu',
    );
    if (!pattern.test(work)) continue;
    const score = category.name.length + (category.parentName ? 0.5 : 0);
    if (score > categoryScore) {
      categoryScore = score;
      categoryId = category.id;
    }
  }

  // What remains is the description.
  let description = work
    .replace(/[₹$€£]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const leading = new RegExp(`^(?:${FILLER}\\s+)+`, 'i');
  const trailing = new RegExp(`(?:\\s+${FILLER})+$`, 'i');
  description = description
    .replace(/^[\s,.;:+-]+|[\s,.;:+-]+$/g, '')
    .replace(leading, '')
    .replace(trailing, '')
    .trim();
  if (description.length > 0)
    description = description.charAt(0).toUpperCase() + description.slice(1);

  return {
    amount,
    type,
    description,
    date,
    dateText: dateResult.text,
    accountId,
    categoryId,
    tags,
  };
}
