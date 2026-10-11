using System.Text.Json;
using ExpenseTracker.Api.Extensions;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Domain.Exceptions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/imports")]
[Produces("application/json")]
[EnableRateLimiting(ApiServiceCollectionExtensions.ImportRateLimitPolicy)]
public sealed class ImportsController(IImportService imports) : ControllerBase
{
    private const long MaxRequestBytes = 20 * 1024 * 1024;
    private const int MaxMappingJsonLength = 500_000;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Dry run: shows what would be imported and which rows are duplicates. Writes nothing.</summary>
    [HttpPost("preview")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    public async Task<ActionResult<ImportPreviewDto>> Preview(
        IFormFile file,
        [FromForm] string? timeZone,
        [FromForm] ImportMatchMode? matchMode,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var input = new ImportFileInput(Path.GetFileName(file.FileName), stream, file.Length);
        var run = new ImportRunOptions(timeZone, matchMode ?? ImportMatchMode.Smart);
        return Ok(await imports.PreviewAsync(input, run, cancellationToken));
    }

    /// <summary>
    /// Imports the file. Rows that already exist are skipped; the same file cannot be imported twice.
    /// <c>mappings</c> is optional JSON: {"accounts":{"File account":"guid"},"categories":{"Expense|File category":"guid"}}.
    /// </summary>
    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    [ProducesResponseType(typeof(ImportResultDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<ImportResultDto>> Import(
        IFormFile file,
        [FromForm] string? timeZone,
        [FromForm] ImportMatchMode? matchMode,
        [FromForm] string? mappings,
        CancellationToken cancellationToken)
    {
        var run = new ImportRunOptions(timeZone, matchMode ?? ImportMatchMode.Smart, ParseMappings(mappings));

        await using var stream = file.OpenReadStream();
        var input = new ImportFileInput(Path.GetFileName(file.FileName), stream, file.Length);
        var result = await imports.ImportAsync(input, run, cancellationToken);
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

    private static ImportMappings? ParseMappings(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        if (json.Length > MaxMappingJsonLength)
        {
            throw new BusinessRuleException("The column mapping is too large.", "invalid_mapping");
        }

        try
        {
            return JsonSerializer.Deserialize<ImportMappings>(json, JsonOptions);
        }
        catch (JsonException)
        {
            throw new BusinessRuleException("The column mapping is not valid.", "invalid_mapping");
        }
    }
}