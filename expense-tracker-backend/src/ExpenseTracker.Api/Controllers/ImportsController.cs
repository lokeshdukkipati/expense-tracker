using ExpenseTracker.Application.Imports;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/imports")]
[Produces("application/json")]
public sealed class ImportsController(IImportService imports) : ControllerBase
{
    private const long MaxRequestBytes = 20 * 1024 * 1024;

    /// <summary>Dry run: shows what would be imported and which rows are duplicates. Writes nothing.</summary>
    [HttpPost("preview")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    public async Task<ActionResult<ImportPreviewDto>> Preview(IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var input = new ImportFileInput(Path.GetFileName(file.FileName), stream, file.Length);
        return Ok(await imports.PreviewAsync(input, cancellationToken));
    }

    /// <summary>Imports the file. Rows that already exist are skipped; the same file cannot be imported twice.</summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    [ProducesResponseType(typeof(ImportResultDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<ImportResultDto>> Import(
        IFormFile file, [FromForm] string? timeZone, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var input = new ImportFileInput(Path.GetFileName(file.FileName), stream, file.Length);
        var result = await imports.ImportAsync(input, timeZone, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ImportBatchDto>>> List(CancellationToken cancellationToken) =>
        Ok(await imports.ListBatchesAsync(cancellationToken));

    /// <summary>Undo: permanently removes the batch and every transaction it created.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await imports.DeleteBatchAsync(id, cancellationToken);
        return NoContent();
    }
}
