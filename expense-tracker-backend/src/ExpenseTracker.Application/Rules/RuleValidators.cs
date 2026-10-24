using ExpenseTracker.Domain.Enums;
using FluentValidation;

namespace ExpenseTracker.Application.Rules;

public sealed class CreateRuleRequestValidator : AbstractValidator<CreateRuleRequest>
{
    public CreateRuleRequestValidator()
    {
        RuleFor(x => x.Pattern)
            .NotEmpty()
            .MaximumLength(100)
            .Must(p => CategoryRuleMatcher.Normalize(p).Length >= 2).WithMessage("Enter at least 2 characters.");
        RuleFor(x => x.MatchType).IsInEnum();
        RuleFor(x => x.Type).IsInEnum()
            .Must(t => t is TransactionType.Expense or TransactionType.Income)
            .WithMessage("Rules apply to expenses or income.");
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Priority).InclusiveBetween(-1000, 1000);
    }
}

public sealed class UpdateRuleRequestValidator : AbstractValidator<UpdateRuleRequest>
{
    public UpdateRuleRequestValidator()
    {
        RuleFor(x => x.Pattern)
            .NotEmpty()
            .MaximumLength(100)
            .Must(p => CategoryRuleMatcher.Normalize(p).Length >= 2).WithMessage("Enter at least 2 characters.");
        RuleFor(x => x.MatchType).IsInEnum();
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Priority).InclusiveBetween(-1000, 1000);
    }
}