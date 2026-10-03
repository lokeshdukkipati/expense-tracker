using ExpenseTracker.Application.Budgets;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/budgets")]
[Produces("application/json")]
public sealed class BudgetsController(IBudgetService budgets) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BudgetDto>>> List(CancellationToken cancellationToken) =>
        Ok(await budgets.ListAsync(cancellationToken));

    /// <summary>Spending versus limit for every active budget in its current period.</summary>
    [HttpGet("status")]
    public async Task<ActionResult<IReadOnlyList<BudgetStatusDto>>> Status(
        [FromQuery] string? timeZone, [FromQuery] DateOnly? asOf, CancellationToken cancellationToken) =>
        Ok(await budgets.GetStatusAsync(timeZone, asOf, cancellationToken));

    [HttpPost]
    [ProducesResponseType(typeof(BudgetDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<BudgetDto>> Create([FromBody] CreateBudgetRequest request, CancellationToken cancellationToken)
    {
        var budget = await budgets.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, budget);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BudgetDto>> Update(Guid id, [FromBody] UpdateBudgetRequest request, CancellationToken cancellationToken) =>
        Ok(await budgets.UpdateAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await budgets.DeleteAsync(id, cancellationToken);
        return NoContent();
    }
}
