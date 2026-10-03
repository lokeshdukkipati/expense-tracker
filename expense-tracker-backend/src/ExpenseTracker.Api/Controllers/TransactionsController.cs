using ExpenseTracker.Application.Common;
using ExpenseTracker.Application.Exports;
using ExpenseTracker.Application.Transactions;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/transactions")]
[Produces("application/json")]
public sealed class TransactionsController(ITransactionService transactions, IExportService exports) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<TransactionDto>>> Query([FromQuery] TransactionQuery query, CancellationToken cancellationToken) =>
        Ok(await transactions.QueryAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TransactionDto>> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await transactions.GetAsync(id, cancellationToken));

    [HttpPost]
    [ProducesResponseType(typeof(TransactionDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<TransactionDto>> Create([FromBody] CreateTransactionRequest request, CancellationToken cancellationToken)
    {
        var transaction = await transactions.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = transaction.Id }, transaction);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TransactionDto>> Update(Guid id, [FromBody] UpdateTransactionRequest request, CancellationToken cancellationToken) =>
        Ok(await transactions.UpdateAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await transactions.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("bulk-delete")]
    public async Task<ActionResult<BulkDeleteResult>> BulkDelete([FromBody] BulkDeleteRequest request, CancellationToken cancellationToken) =>
        Ok(await transactions.BulkDeleteAsync(request, cancellationToken));

    /// <summary>Downloads the filtered transactions as CSV (default) or XLSX.</summary>
    [HttpGet("export")]
    [Produces("text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    public async Task<IActionResult> Export(
        [FromQuery] TransactionFilter filter, [FromQuery] ExportFormat format, CancellationToken cancellationToken)
    {
        var file = await exports.ExportTransactionsAsync(filter, format, cancellationToken);
        return File(file.Content, file.ContentType, file.FileName);
    }
}
