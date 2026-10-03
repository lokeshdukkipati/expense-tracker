using FluentValidation;

namespace ExpenseTracker.Application.Accounts;

public sealed class CreateAccountRequestValidator : AbstractValidator<CreateAccountRequest>
{
    public CreateAccountRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Currency)
            .Matches("^[A-Z]{3}$").WithMessage("Currency must be a 3-letter ISO code such as INR.")
            .When(x => !string.IsNullOrWhiteSpace(x.Currency));
        RuleFor(x => x.OpeningBalance)
            .InclusiveBetween(-1_000_000_000_000m, 1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
    }
}

public sealed class UpdateAccountRequestValidator : AbstractValidator<UpdateAccountRequest>
{
    public UpdateAccountRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.OpeningBalance)
            .InclusiveBetween(-1_000_000_000_000m, 1_000_000_000_000m)
            .PrecisionScale(18, 2, false);
    }
}
