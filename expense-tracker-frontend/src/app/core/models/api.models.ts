// Mirrors the backend DTOs (camelCase JSON, enums as strings, DateOnly as "YYYY-MM-DD").

export type TransactionType = 'Expense' | 'Income';
/** What a stored transaction can be: income, an expense, or one leg of a transfer between the user's own accounts. */
export type TransactionKind = TransactionType | 'TransferOut' | 'TransferIn';
export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentName =
  | 'violet'
  | 'ocean'
  | 'emerald'
  | 'sunset'
  | 'rose'
  | 'amber';
export type AccountType = 'Cash' | 'Bank' | 'Card' | 'Wallet' | 'Investment' | 'Other';
export type TransactionSource = 'Manual' | 'Import';
export type BudgetPeriod = 'Weekly' | 'Monthly' | 'Yearly';
export type BudgetState = 'OnTrack' | 'Warning' | 'Exceeded';
export type ImportStatus = 'Completed' | 'Failed';
export type TrendGranularity = 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year';
export type ExportFormat = 'Csv' | 'Xlsx';
export type DayName = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

// ---------------------------------------------------------------- auth
export interface UserDto { id: string; email: string; fullName: string; defaultCurrency: string }
export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: UserDto;
}
export interface RegisterRequest { email: string; password: string; fullName: string; defaultCurrency: string }
export interface LoginRequest { email: string; password: string }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface UpdateProfileRequest { fullName: string; defaultCurrency: string }

// ---------------------------------------------------------------- shared
export interface PagedResult<T> { items: T[]; page: number; pageSize: number; totalCount: number; totalPages: number }

// ---------------------------------------------------------------- accounts & categories
export interface AccountDto {
  id: string; name: string; type: AccountType; currency: string;
  openingBalance: number; currentBalance: number; isArchived: boolean; version: number;
}
export interface CreateAccountRequest { name: string; type: AccountType; currency: string | null; openingBalance: number }
export interface UpdateAccountRequest { name: string; type: AccountType; openingBalance: number; isArchived: boolean; version: number }

export interface CategoryDto {
  id: string; name: string; type: TransactionType; parentId: string | null;
  color: string | null; icon: string | null; isArchived: boolean; version: number;
}
export interface CreateCategoryRequest { name: string; type: TransactionType; parentId: string | null; color: string | null; icon: string | null }
export interface UpdateCategoryRequest { name: string; color: string | null; icon: string | null; isArchived: boolean; version: number }

// ---------------------------------------------------------------- transactions
export interface TransactionDto {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  type: TransactionKind;
  amount: number;
  currency: string;
  occurredAt: string;
  description: string | null;
  note: string | null;
  tags: string[];
  source: TransactionSource;
  createdAt: string;
  version: number;
  /** Set on both legs of a transfer; null for ordinary income and expenses. */
  transferGroupId: string | null;
  /** The account on the other side of the transfer. */
  transferAccountId: string | null;
  transferAccountName: string | null;
}
export interface TransactionInput {
  accountId: string; categoryId: string; type: TransactionType; amount: number; occurredAt: string;
  description: string | null; note: string | null; tags: string[];
}
export interface UpdateTransactionInput extends TransactionInput { version: number }

export interface TransactionFilterParams {
  from?: string;
  to?: string;
  type?: TransactionKind | null;
  accountId?: string | null;
  categoryId?: string | null;
  search?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  tag?: string;
  source?: TransactionSource | null;
}
export interface TransactionQueryParams extends TransactionFilterParams {
  page: number; pageSize: number; sortBy: 'date' | 'amount'; sortDir: 'asc' | 'desc';
}

// ---------------------------------------------------------------- imports
export interface ImportBatchDto {
  id: string; fileName: string; format: string; totalRows: number; importedRows: number;
  duplicateRows: number; invalidRows: number; status: ImportStatus; createdAt: string;
}
export interface ImportRowSampleDto {
  rowNumber: number;
  localTimestamp: string;
  type: TransactionKind;
  amount: number;
  currency: string;
  account: string;
  category: string;
  subcategory: string | null;
  description: string | null;
}
export interface InvalidRowDto {
  rowNumber: number;
  reason: string;
}
export type ImportMatchMode = 'Exact' | 'Smart' | 'Loose';
export interface DuplicateRowDto {
  rowNumber: number;
  localTimestamp: string;
  type: TransactionKind;
  amount: number;
  currency: string;
  description: string | null;
  reason: string;
}
export interface ImportWarningDto {
  rowNumber: number;
  message: string;
}
export interface FileAccountDto {
  name: string;
  rows: number;
  matchedAccountId: string | null;
}
export interface FileCategoryDto {
  type: TransactionType;
  name: string;
  rows: number;
  matchedCategoryId: string | null;
}
export interface ImportMappings {
  accounts: Record<string, string>;
  categories: Record<string, string>;
}
export interface ImportPreviewDto {
  fileName: string;
  fileHash: string;
  format: string;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  invalidRows: number;
  fileAlreadyImported: boolean;
  previousImport: ImportBatchDto | null;
  firstDate: string | null;
  lastDate: string | null;
  newIncomeTotal: number;
  newExpenseTotal: number;
  newAccounts: string[];
  newCategories: string[];
  sampleNewRows: ImportRowSampleDto[];
  invalidSamples: InvalidRowDto[];
  matchMode: ImportMatchMode;
  warningRows: number;
  duplicateSamples: DuplicateRowDto[];
  warnings: ImportWarningDto[];
  fileAccounts: FileAccountDto[];
  fileCategories: FileCategoryDto[];
  newTransfers: number;
  newTransferTotal: number;
}
export interface ImportResultDto {
  batch: ImportBatchDto;
  accountsCreated: number;
  categoriesCreated: number;
  transfersCreated: number;
}

// ---------------------------------------------------------------- budgets
export interface BudgetDto {
  id: string; categoryId: string | null; categoryName: string | null; amount: number; currency: string;
  period: BudgetPeriod; alertThresholdPercent: number; isActive: boolean; version: number;
}
export interface CreateBudgetRequest { categoryId: string | null; amount: number; period: BudgetPeriod; alertThresholdPercent: number }
export interface UpdateBudgetRequest { amount: number; alertThresholdPercent: number; isActive: boolean; version: number }
export interface BudgetStatusDto {
  budget: BudgetDto; periodStart: string; periodEnd: string; spent: number; remaining: number; percentUsed: number;
  state: BudgetState; projectedSpend: number; daysLeft: number; projectedToExceed: boolean;
}

// ---------------------------------------------------------------- analytics
export interface AnalyticsFilterParams { from?: string; to?: string; accountId?: string | null; categoryId?: string | null }

export interface TransactionBriefDto { id: string; occurredAt: string; description: string | null; categoryName: string; amount: number }
export interface PeriodTotalsDto { from: string; to: string; income: number; expense: number; net: number }
export interface SummaryDto {
  from: string; to: string; income: number; expense: number; net: number; savingsRatePercent: number | null;
  transactionCount: number; averageDailyExpense: number; largestExpense: TransactionBriefDto | null;
  largestIncome: TransactionBriefDto | null; previous: PeriodTotalsDto;
  expenseChangePercent: number | null; incomeChangePercent: number | null;
}
export interface CategoryAmountDto { categoryId: string; name: string; color: string | null; amount: number; percent: number; count: number }
export interface CategoryBreakdownDto { type: TransactionType; total: number; items: CategoryAmountDto[] }
export interface TrendPointDto { periodStart: string; income: number; expense: number; net: number; count: number }
export interface WeekdayStatDto { day: DayName; total: number; count: number; averagePerDay: number }
export interface HourStatDto { hour: number; total: number; count: number }
export interface PatternsDto { byWeekday: WeekdayStatDto[]; byHour: HourStatDto[] }
export interface TopDescriptionDto { description: string; total: number; count: number; average: number; lastOccurredAt: string }
export interface RecurringExpenseDto {
  description: string; categoryName: string | null; typicalAmount: number; occurrences: number;
  averageIntervalDays: number; frequency: string; lastDate: string; nextExpectedDate: string; monthlyCost: number;
}
export interface AnomalyDto {
  transactionId: string; occurredAt: string; description: string | null; categoryName: string;
  amount: number; categoryAverage: number; zScore: number;
}
export interface ForecastMonthDto { monthStart: string; projectedExpense: number }
export interface ForecastDto {
  asOf: string; monthStart: string; monthEnd: string; spentSoFar: number; dailyRunRate: number;
  projectedMonthEnd: number; daysRemaining: number; trailingMonthlyAverage: number; nextMonths: ForecastMonthDto[];
}
export interface CategoryComparisonDto {
  categoryId: string; name: string; color: string | null; current: number; previous: number; change: number; changePercent: number | null;
}
export interface TagStatDto {
  tag: string;
  expense: number;
  income: number;
  count: number;
}

// ---------------------------------------------------------------- transfers
export interface TransferDto {
  groupId: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  currency: string;
  occurredAt: string;
  description: string | null;
  note: string | null;
  tags: string[];
  outTransactionId: string;
  inTransactionId: string;
  version: number;
}
export interface TransferResultDto {
  transfer: TransferDto;
  feeTransactionId: string | null;
}
export interface CreateTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt: string;
  description: string | null;
  note: string | null;
  tags: string[] | null;
  /** An optional fee (for example an ATM charge), recorded as a separate expense on the source account. */
  fee?: number | null;
  feeCategoryId?: string | null;
}
export interface UpdateTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredAt: string;
  description: string | null;
  note: string | null;
  tags: string[] | null;
  version: number;
}
export interface ConvertToTransferRequest {
  otherAccountId: string;
  version: number;
}
export interface ReconcileAccountRequest {
  actualBalance: number;
}
export interface ReconcileResultDto {
  accountId: string;
  previousBalance: number;
  newBalance: number;
  adjustment: number;
  openingBalance: number;
}

// ---------------------------------------------------------------- savings goals
export type GoalStatus =
  | 'completed'
  | 'on_track'
  | 'behind'
  | 'overdue'
  | 'no_deadline';
export interface GoalDto {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  currency: string;
  targetDate: string | null;
  daysLeft: number | null;
  requiredPerMonth: number | null;
  projectedDate: string | null;
  status: GoalStatus;
  isCompleted: boolean;
  completedAt: string | null;
  accountId: string | null;
  accountName: string | null;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
  version: number;
}
export interface CreateGoalRequest {
  name: string;
  targetAmount: number;
  initialAmount: number | null;
  targetDate: string | null;
  accountId: string | null;
  color: string | null;
  icon: string | null;
}
export interface UpdateGoalRequest {
  name: string;
  targetAmount: number;
  targetDate: string | null;
  accountId: string | null;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
  version: number;
}
export interface ContributeGoalRequest {
  amount: number;
}

// ---------------------------------------------------------------- category rules
export type RuleMatchType = 'Contains' | 'StartsWith' | 'Equals';
export interface RuleDto {
  id: string;
  pattern: string;
  matchType: RuleMatchType;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  parentCategoryName: string | null;
  priority: number;
  isActive: boolean;
  timesApplied: number;
  version: number;
}
export interface CreateRuleRequest {
  pattern: string;
  matchType: RuleMatchType;
  type: TransactionType;
  categoryId: string;
  priority?: number;
}
export interface UpdateRuleRequest {
  pattern: string;
  matchType: RuleMatchType;
  categoryId: string;
  priority: number;
  isActive: boolean;
  version: number;
}
export interface RuleMatchDto {
  ruleId: string;
  pattern: string;
  categoryId: string;
  categoryName: string;
  parentCategoryName: string | null;
}
export interface RuleMatchResultDto {
  match: RuleMatchDto | null;
}
export interface ApplyRuleRequest {
  dryRun: boolean;
}
export interface ApplyRuleResultDto {
  matchedCount: number;
  updatedCount: number;
}

// ---------------------------------------------------------------- net worth
export interface NetWorthAccountDto {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  isArchived: boolean;
  includedInTotal: boolean;
}
export interface NetWorthTypeDto {
  type: AccountType;
  total: number;
  accounts: number;
}
export interface NetWorthPointDto {
  monthEnd: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}
export interface NetWorthDto {
  currency: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  monthlyChange: number;
  monthlyChangePercent: number | null;
  excludedAccounts: number;
  accounts: NetWorthAccountDto[];
  byType: NetWorthTypeDto[];
  history: NetWorthPointDto[];
}

// ---------------------------------------------------------------- streaks and badges
export type BadgeTier = 'bronze' | 'silver' | 'gold';
export interface StreakDto {
  current: number;
  best: number;
  unit: 'days' | 'months';
  available: boolean;
}
export interface BadgeDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  group: string;
  isEarned: boolean;
  progress: number;
  target: number;
}
export interface AchievementsDto {
  logging: StreakDto;
  noSpend: StreakDto;
  budget: StreakDto;
  noSpendDaysLast30: number;
  earnedCount: number;
  totalCount: number;
  badges: BadgeDto[];
}

// ---------------------------------------------------------------- duplicates and sample data
export interface DuplicateChargeDto {
  key: string;
  firstId: string;
  secondId: string;
  firstAt: string;
  secondAt: string;
  amount: number;
  currency: string;
  description: string | null;
  accountName: string;
  categoryName: string;
  minutesApart: number;
  confidence: 'high' | 'medium' | 'low';
}
export interface SampleDataStatusDto {
  isLoaded: boolean;
  accountCount: number;
  transactionCount: number;
}

// ---------------------------------------------------------------- user preferences (saved on the account)
export interface DashboardLayout {
  order: string[];
  hidden: string[];
}
export interface UserPreferences {
  theme?: ThemeMode;
  accent?: AccentName;
  reduceMotion?: boolean;
  dashboardLayout?: DashboardLayout;
  onboardingDone?: boolean;
  seenBadges?: string[];
  dismissedDuplicates?: string[];
}
/** A preferences update: a key set to null is removed. */
export type PreferencesPatch = {
  [K in keyof UserPreferences]?: UserPreferences[K] | null;
};

// ---------------------------------------------------------------- errors
export interface ProblemDetails {
  type?: string; title?: string; status?: number; detail?: string; instance?: string;
  code?: string; traceId?: string; errors?: Record<string, string[]>;
}
