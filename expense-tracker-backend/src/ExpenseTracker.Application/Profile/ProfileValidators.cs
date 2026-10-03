using FluentValidation;

namespace ExpenseTracker.Application.Profile;

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DefaultCurrency).NotEmpty().Matches("^[A-Z]{3}$")
            .WithMessage("Currency must be a 3-letter ISO code such as INR.");
    }
}

public sealed class DeleteAccountRequestValidator : AbstractValidator<DeleteAccountRequest>
{
    public DeleteAccountRequestValidator()
    {
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}
