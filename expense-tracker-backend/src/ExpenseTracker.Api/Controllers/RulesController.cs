using ExpenseTracker.Application.Rules;
using ExpenseTracker.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/rules")]
[Produces("application/json")]
public sealed class RulesController(IRuleService rules) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<RuleDto>>> List(CancellationToken cancellationToken) =>
        Ok(await rules.ListAsync(cancellationToken));

    [HttpPost]
    [ProducesResponseType(typeof(RuleDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<RuleDto>> Create([FromBody] CreateRuleRequest request, CancellationToken cancellationToken)
    {
        var rule = await rules.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, rule);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<RuleDto>> Update(
        Guid id, [FromBody] UpdateRuleRequest request, CancellationToken cancellationToken) =>
        Ok(await rules.UpdateAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await rules.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>Which rule would categorise this text? (Used while typing a quick-add entry.)</summary>
    [HttpGet("match")]
    public async Task<ActionResult<RuleMatchResultDto>> Match(
        [FromQuery] TransactionType type, [FromQuery] string? text, CancellationToken cancellationToken) =>
        Ok(await rules.MatchAsync(type, text, cancellationToken));

    /// <summary>Re-categorises existing transactions that match the rule. Use dryRun to count first.</summary>
    [HttpPost("{id:guid}/apply")]
    public async Task<ActionResult<ApplyRuleResultDto>> Apply(
        Guid id, [FromBody] ApplyRuleRequest request, CancellationToken cancellationToken) =>
        Ok(await rules.ApplyAsync(id, request, cancellationToken));
}