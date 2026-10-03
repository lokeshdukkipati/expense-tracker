using FluentValidation;

namespace ExpenseTracker.Application.Analytics;

public sealed class AnalyticsFilterValidator : AbstractValidator<AnalyticsFilter>
{
    public const int MaxRangeDays = 3660;

    public AnalyticsFilterValidator()
    {
        RuleFor(x => x.TimeZone).MaximumLength(64);
        RuleFor(x => x.To)
            .Must((x, to) => to!.Value >= x.From!.Value)
            .When(x => x.From.HasValue && x.To.HasValue)
            .WithMessage("'To' must be on or after 'From'.");
        RuleFor(x => x.To)
            .Must((x, to) => to!.Value.DayNumber - x.From!.Value.DayNumber < MaxRangeDays)
            .When(x => x.From.HasValue && x.To.HasValue)
            .WithMessage($"The date range cannot exceed {MaxRangeDays} days.");
    }
}
