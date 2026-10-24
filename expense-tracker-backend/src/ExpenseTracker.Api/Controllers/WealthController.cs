using ExpenseTracker.Application.Achievements;
using ExpenseTracker.Application.NetWorth;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/wealth")]
[Produces("application/json")]
public sealed class WealthController(INetWorthService netWorth, IAchievementService achievements) : ControllerBase
{
    /// <summary>Assets, liabilities and net worth now, by account type, with month-end history.</summary>
    [HttpGet("net-worth")]
    public async Task<ActionResult<NetWorthDto>> GetNetWorth(
        [FromQuery] int? months, [FromQuery] string? timeZone, CancellationToken cancellationToken) =>
        Ok(await netWorth.GetAsync(months, timeZone, cancellationToken));

    /// <summary>Streaks (logging, no-spend, budget) and badges, computed from your data.</summary>
    [HttpGet("achievements")]
    public async Task<ActionResult<AchievementsDto>> GetAchievements(
        [FromQuery] string? timeZone, CancellationToken cancellationToken) =>
        Ok(await achievements.GetAsync(timeZone, cancellationToken));
}