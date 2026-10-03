namespace ExpenseTracker.Domain.Enums;

public enum TransactionType
{
    Expense = 1,
    Income = 2
}

public enum AccountType
{
    Cash = 1,
    Bank = 2,
    Card = 3,
    Wallet = 4,
    Investment = 5,
    Other = 6
}

public enum TransactionSource
{
    Manual = 1,
    Import = 2
}

public enum ImportStatus
{
    Completed = 1,
    Failed = 2
}

public enum BudgetPeriod
{
    Weekly = 1,
    Monthly = 2,
    Yearly = 3
}
