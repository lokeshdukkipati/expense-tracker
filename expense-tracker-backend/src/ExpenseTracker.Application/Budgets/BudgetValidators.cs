using FluentValidation;

namespace ExpenseTracker.Application.Budgets;

public sealed class CreateBudgetRequestValidator : AbstractValidator<CreateBudgetRequest>
{
    public CreateBudgetRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m).LessThanOrEqualTo(1_000_000_000_000m).PrecisionScale(18, 2, false);
        RuleFor(x => x.Period).IsInEnum();
        RuleFor(x => x.AlertThresholdPercent).InclusiveBetween(1, 100);
    }
}

public sealed class UpdateBudgetRequestValidator : AbstractValidator<UpdateBudgetRequest>
{
    public UpdateBudgetRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m).LessThanOrEqualTo(1_000_000_000_000m).PrecisionScale(18, 2, false);
        RuleFor(x => x.AlertThresholdPercent).InclusiveBetween(1, 100);
    }
}
