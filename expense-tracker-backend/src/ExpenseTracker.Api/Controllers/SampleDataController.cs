using ExpenseTracker.Application.SampleData;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/sample-data")]
[Produces("application/json")]
public sealed class SampleDataController(ISampleDataService sampleData) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<SampleDataStatusDto>> Status(CancellationToken cancellationToken) =>
        Ok(await sampleData.GetStatusAsync(cancellationToken));

    /// <summary>Adds three demo accounts, about 90 days of transactions and two goals.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(SampleDataStatusDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<SampleDataStatusDto>> Load(CancellationToken cancellationToken)
    {
        var status = await sampleData.LoadAsync(cancellationToken);
        return StatusCode(StatusCodes.Status201Created, status);
    }

    /// <summary>Removes the demo accounts and everything recorded on them.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Remove(CancellationToken cancellationToken)
    {
        await sampleData.RemoveAsync(cancellationToken);
        return NoContent();
    }
}