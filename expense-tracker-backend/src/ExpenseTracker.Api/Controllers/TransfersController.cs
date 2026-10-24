using ExpenseTracker.Application.Transfers;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1")]
[Produces("application/json")]
public sealed class TransfersController(ITransferService transfers) : ControllerBase
{
    [HttpPost("transfers")]
    [ProducesResponseType(typeof(TransferResultDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<TransferResultDto>> Create([FromBody] CreateTransferRequest request, CancellationToken cancellationToken)
    {
        var result = await transfers.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpGet("transfers/{groupId:guid}")]
    public async Task<ActionResult<TransferDto>> Get(Guid groupId, CancellationToken cancellationToken) =>
        Ok(await transfers.GetAsync(groupId, cancellationToken));

    [HttpPut("transfers/{groupId:guid}")]
    public async Task<ActionResult<TransferDto>> Update(
        Guid groupId, [FromBody] UpdateTransferRequest request, CancellationToken cancellationToken) =>
        Ok(await transfers.UpdateAsync(groupId, request, cancellationToken));

    /// <summary>Removes both legs of the transfer.</summary>
    [HttpDelete("transfers/{groupId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid groupId, CancellationToken cancellationToken)
    {
        await transfers.DeleteAsync(groupId, cancellationToken);
        return NoContent();
    }

    /// <summary>Turns an existing expense or income into a transfer to or from another account.</summary>
    [HttpPost("transactions/{id:guid}/convert-to-transfer")]
    public async Task<ActionResult<TransferDto>> Convert(
        Guid id, [FromBody] ConvertToTransferRequest request, CancellationToken cancellationToken) =>
        Ok(await transfers.ConvertAsync(id, request, cancellationToken));

    /// <summary>Sets the account's balance to the actual amount by correcting its opening balance.</summary>
    [HttpPost("accounts/{id:guid}/reconcile")]
    public async Task<ActionResult<ReconcileResultDto>> Reconcile(
        Guid id, [FromBody] ReconcileAccountRequest request, CancellationToken cancellationToken) =>
        Ok(await transfers.ReconcileAsync(id, request, cancellationToken));
}