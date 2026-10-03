using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Auth;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Profile;

public sealed class ProfileService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IPasswordService passwords,
    IValidator<UpdateProfileRequest> updateValidator,
    IValidator<DeleteAccountRequest> deleteValidator) : IProfileService
{
    public async Task<UserDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(User), userId);

        user.FullName = request.FullName.Trim();
        user.DefaultCurrency = request.DefaultCurrency;

        await db.SaveChangesAsync(cancellationToken);
        return new UserDto(user.Id, user.Email, user.FullName, user.DefaultCurrency);
    }

    public async Task DeleteAccountAsync(DeleteAccountRequest request, CancellationToken cancellationToken)
    {
        await deleteValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var passwordHash = await db.Users.AsNoTracking()
                               .Where(u => u.Id == userId).Select(u => u.PasswordHash)
                               .FirstOrDefaultAsync(cancellationToken)
                           ?? throw new NotFoundException(nameof(User), userId);

        if (passwords.Verify(passwordHash, request.Password) == PasswordVerifyResult.Failed)
        {
            throw new BusinessRuleException("The password is incorrect.", "invalid_password");
        }

        // Explicit order (children before parents) because foreign keys to accounts and categories are RESTRICT.
        await db.ExecuteInTransactionAsync(async () =>
        {
            await db.Transactions.IgnoreQueryFilters().Where(t => t.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.Budgets.Where(b => b.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.ImportBatches.Where(b => b.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.Categories.Where(c => c.UserId == userId && c.ParentId != null).ExecuteDeleteAsync(cancellationToken);
            await db.Categories.Where(c => c.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.Accounts.Where(a => a.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.RefreshTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync(cancellationToken);
            await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(cancellationToken);
        }, cancellationToken);
    }
}
