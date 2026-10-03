using ExpenseTracker.Application.Auth;

namespace ExpenseTracker.Application.Profile;

public interface IProfileService
{
    Task<UserDto> UpdateAsync(UpdateProfileRequest request, CancellationToken cancellationToken);

    /// <summary>Permanently deletes the user and every piece of their data. Requires the current password.</summary>
    Task DeleteAccountAsync(DeleteAccountRequest request, CancellationToken cancellationToken);
}
