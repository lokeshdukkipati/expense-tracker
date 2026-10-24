using FluentValidation;

namespace ExpenseTracker.Application.Goals;

public abstract class GoalInputValidator<T> : AbstractValidator<T> where T : IGoalInput
{
    protected GoalInputValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.TargetAmount)
            .GreaterThan(0m)
            .LessThanOrEqualTo(1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
        RuleFor(x => x.Color)
            .Matches("^#[0-9A-Fa-f]{6}$").WithMessage("Colour must look like #F97316.")
            .When(x => !string.IsNullOrEmpty(x.Color));
        RuleFor(x => x.Icon)
            .MaximumLength(50)
            .Matches("^[a-z0-9_-]+$").WithMessage("Icon may only contain lower-case letters, digits, '-' and '_'.")
            .When(x => !string.IsNullOrEmpty(x.Icon));
    }
}

public sealed class CreateGoalRequestValidator : GoalInputValidator<CreateGoalRequest>
{
    public CreateGoalRequestValidator(TimeProvider clock)
    {
        RuleFor(x => x.TargetDate)
            .Must(d => d is null || d.Value.Year is >= 1970 and <= 2200)
            .WithMessage("Target date is out of range.")
            .Must(d => d is null || d.Value >= DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(-1))
            .WithMessage("Target date cannot be in the past.");

        RuleFor(x => x.InitialAmount)
            .GreaterThanOrEqualTo(0m)
            .LessThanOrEqualTo(1_000_000_000_000m)
            .PrecisionScale(18, 2, false)
            .When(x => x.InitialAmount.HasValue);

        RuleFor(x => x.InitialAmount)
            .Null().WithMessage("A goal that follows an account balance cannot also have a starting amount.")
            .When(x => x.AccountId.HasValue);
    }
}

public sealed class UpdateGoalRequestValidator : GoalInputValidator<UpdateGoalRequest>
{
    public UpdateGoalRequestValidator()
    {
        RuleFor(x => x.TargetDate)
            .Must(d => d is null || d.Value.Year is >= 1970 and <= 2200)
            .WithMessage("Target date is out of range.");
    }
}

public sealed class ContributeGoalRequestValidator : AbstractValidator<ContributeGoalRequest>
{
    public ContributeGoalRequestValidator()
    {
        RuleFor(x => x.Amount)
            .NotEqual(0m).WithMessage("Enter an amount.")
            .InclusiveBetween(-1_000_000_000_000m, 1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
    }
}