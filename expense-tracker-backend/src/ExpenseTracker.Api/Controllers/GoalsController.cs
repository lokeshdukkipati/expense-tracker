using ExpenseTracker.Application.Goals;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/goals")]
[Produces("application/json")]
public sealed class GoalsController(IGoalService goals) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GoalDto>>> List(
        [FromQuery] bool includeArchived, CancellationToken cancellationToken) =>
        Ok(await goals.ListAsync(includeArchived, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GoalDto>> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await goals.GetAsync(id, cancellationToken));

    [HttpPost]
    [ProducesResponseType(typeof(GoalDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<GoalDto>> Create([FromBody] CreateGoalRequest request, CancellationToken cancellationToken)
    {
        var goal = await goals.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, goal);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<GoalDto>> Update(
        Guid id, [FromBody] UpdateGoalRequest request, CancellationToken cancellationToken) =>
        Ok(await goals.UpdateAsync(id, request, cancellationToken));

    /// <summary>Adds money to (positive) or takes money out of (negative) a manually tracked goal.</summary>
    [HttpPost("{id:guid}/contribute")]
    public async Task<ActionResult<GoalDto>> Contribute(
        Guid id, [FromBody] ContributeGoalRequest request, CancellationToken cancellationToken) =>
        Ok(await goals.ContributeAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await goals.DeleteAsync(id, cancellationToken);
        return NoContent();
    }
}