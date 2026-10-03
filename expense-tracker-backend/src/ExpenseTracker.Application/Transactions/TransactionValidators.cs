using FluentValidation;

namespace ExpenseTracker.Application.Transactions;

public abstract class TransactionFilterValidatorBase<T> : AbstractValidator<T> where T : TransactionFilter
{
    protected TransactionFilterValidatorBase()
    {
        RuleFor(x => x.Type).IsInEnum().When(x => x.Type.HasValue);
        RuleFor(x => x.Source).IsInEnum().When(x => x.Source.HasValue);
        RuleFor(x => x.Search).MaximumLength(100);
        RuleFor(x => x.Tag).MaximumLength(30);
        RuleFor(x => x.TimeZone).MaximumLength(64);
        RuleFor(x => x.From).Must(d => d!.Value.Year is >= 1970 and <= 2200)
            .When(x => x.From.HasValue).WithMessage("Date is out of range.");
        RuleFor(x => x.To).Must(d => d!.Value.Year is >= 1970 and <= 2200)
            .When(x => x.To.HasValue).WithMessage("Date is out of range.");
        RuleFor(x => x.To)
            .Must((x, to) => to!.Value >= x.From!.Value)
            .When(x => x.From.HasValue && x.To.HasValue)
            .WithMessage("'To' must be on or after 'From'.");
        RuleFor(x => x.MaxAmount)
            .Must((x, max) => max!.Value >= x.MinAmount!.Value)
            .When(x => x.MinAmount.HasValue && x.MaxAmount.HasValue)
            .WithMessage("'MaxAmount' must be greater than or equal to 'MinAmount'.");
    }
}

public sealed class TransactionFilterValidator : TransactionFilterValidatorBase<TransactionFilter>;

public sealed class TransactionQueryValidator : TransactionFilterValidatorBase<TransactionQuery>
{
    public TransactionQueryValidator()
    {
        RuleFor(x => x.Page).InclusiveBetween(1, 1_000_000);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.SortBy).Must(v => v is null || v.ToLowerInvariant() is "date" or "amount")
            .WithMessage("SortBy must be 'date' or 'amount'.");
        RuleFor(x => x.SortDir).Must(v => v is null || v.ToLowerInvariant() is "asc" or "desc")
            .WithMessage("SortDir must be 'asc' or 'desc'.");
    }
}

public abstract class TransactionInputValidator<T> : AbstractValidator<T> where T : ITransactionInput
{
    protected TransactionInputValidator(TimeProvider clock)
    {
        RuleFor(x => x.AccountId).NotEmpty();
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Amount)
            .GreaterThan(0m)
            .LessThanOrEqualTo(1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
        RuleFor(x => x.OccurredAt)
            .Must(v => v <= clock.GetUtcNow().AddDays(1)).WithMessage("Date cannot be in the future.")
            .Must(v => v.Year >= 1970).WithMessage("Date is out of range.");
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.Note).MaximumLength(2000);
        RuleFor(x => x.Tags)
            .Must(t => t is null || t.Count <= 10).WithMessage("At most 10 tags are allowed.")
            .Must(t => t is null || t.All(tag => !string.IsNullOrWhiteSpace(tag) && tag.Trim().Length <= 30))
            .WithMessage("Each tag must be 1-30 characters.");
    }
}

public sealed class CreateTransactionRequestValidator(TimeProvider clock) : TransactionInputValidator<CreateTransactionRequest>(clock);

public sealed class UpdateTransactionRequestValidator(TimeProvider clock) : TransactionInputValidator<UpdateTransactionRequest>(clock);

public sealed class BulkDeleteRequestValidator : AbstractValidator<BulkDeleteRequest>
{
    public BulkDeleteRequestValidator()
    {
        RuleFor(x => x.Ids).NotNull().NotEmpty().Must(ids => ids.Count <= 500)
            .WithMessage("At most 500 transactions can be deleted at once.");
    }
}
