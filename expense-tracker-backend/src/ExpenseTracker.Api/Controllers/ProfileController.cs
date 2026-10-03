using ExpenseTracker.Application.Auth;
using ExpenseTracker.Application.Profile;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/profile")]
[Produces("application/json")]
public sealed class ProfileController(IProfileService profile) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<UserDto>> Update([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken) =>
        Ok(await profile.UpdateAsync(request, cancellationToken));

    /// <summary>Permanently deletes the account and all data. Requires the current password.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete([FromBody] DeleteAccountRequest request, CancellationToken cancellationToken)
    {
        await profile.DeleteAccountAsync(request, cancellationToken);
        return NoContent();
    }
}
