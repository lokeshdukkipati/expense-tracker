using FluentValidation;

namespace ExpenseTracker.Application.Transfers;

public abstract class TransferInputValidator<T> : AbstractValidator<T> where T : ITransferInput
{
    protected TransferInputValidator(TimeProvider clock)
    {
        RuleFor(x => x.FromAccountId).NotEmpty();
        RuleFor(x => x.ToAccountId).NotEmpty()
            .NotEqual(x => x.FromAccountId).WithMessage("Choose two different accounts.");
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

public sealed class CreateTransferRequestValidator : TransferInputValidator<CreateTransferRequest>
{
    public CreateTransferRequestValidator(TimeProvider clock) : base(clock)
    {
        RuleFor(x => x.Fee)
            .GreaterThan(0m)
            .LessThanOrEqualTo(1_000_000_000_000m)
            .PrecisionScale(18, 2, false)
            .When(x => x.Fee.HasValue);
    }
}

public sealed class UpdateTransferRequestValidator(TimeProvider clock) : TransferInputValidator<UpdateTransferRequest>(clock);

public sealed class ConvertToTransferRequestValidator : AbstractValidator<ConvertToTransferRequest>
{
    public ConvertToTransferRequestValidator()
    {
        RuleFor(x => x.OtherAccountId).NotEmpty();
    }
}

public sealed class ReconcileAccountRequestValidator : AbstractValidator<ReconcileAccountRequest>
{
    public ReconcileAccountRequestValidator()
    {
        RuleFor(x => x.ActualBalance)
            .InclusiveBetween(-1_000_000_000_000m, 1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
    }
}