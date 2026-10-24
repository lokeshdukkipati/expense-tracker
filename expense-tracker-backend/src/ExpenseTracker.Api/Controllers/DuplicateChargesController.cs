using ExpenseTracker.Application.Analytics;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/analytics/duplicates")]
[Produces("application/json")]
public sealed class DuplicateChargesController(IDuplicateChargeService duplicates) : ControllerBase
{
    /// <summary>Pairs of expenses that look like the same charge made twice. Nothing is deleted.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DuplicateChargeDto>>> Find(
        [FromQuery] int? days, CancellationToken cancellationToken) =>
        Ok(await duplicates.FindAsync(days, cancellationToken));
}