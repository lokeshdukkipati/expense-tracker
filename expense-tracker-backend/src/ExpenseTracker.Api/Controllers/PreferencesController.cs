using System.Text.Json;
using ExpenseTracker.Application.Preferences;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/preferences")]
[Produces("application/json")]
public sealed class PreferencesController(IPreferencesService preferences) : ControllerBase
{
    /// <summary>Theme, accent colour, dashboard layout and similar UI settings, saved on the account.</summary>
    [HttpGet]
    public async Task<ActionResult<JsonElement>> Get(CancellationToken cancellationToken) =>
        Ok(await preferences.GetAsync(cancellationToken));

    /// <summary>Merges the given keys into the saved preferences. A key set to null is removed.</summary>
    [HttpPatch]
    public async Task<ActionResult<JsonElement>> Update([FromBody] JsonElement patch, CancellationToken cancellationToken) =>
        Ok(await preferences.UpdateAsync(patch, cancellationToken));
}