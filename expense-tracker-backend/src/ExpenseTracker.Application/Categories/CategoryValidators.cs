using FluentValidation;

namespace ExpenseTracker.Application.Categories;

internal static class CategoryRuleExtensions
{
    public static IRuleBuilderOptions<T, string?> MustBeHexColor<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Matches("^#[0-9A-Fa-f]{6}$").WithMessage("Color must be a hex value such as #F97316.");
}

public sealed class CreateCategoryRequestValidator : AbstractValidator<CreateCategoryRequest>
{
    public CreateCategoryRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Color).MustBeHexColor().When(x => !string.IsNullOrWhiteSpace(x.Color));
        RuleFor(x => x.Icon).MaximumLength(50);
    }
}

public sealed class UpdateCategoryRequestValidator : AbstractValidator<UpdateCategoryRequest>
{
    public UpdateCategoryRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Color).MustBeHexColor().When(x => !string.IsNullOrWhiteSpace(x.Color));
        RuleFor(x => x.Icon).MaximumLength(50);
    }
}
