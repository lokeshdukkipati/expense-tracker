using System.Text.Json;

namespace ExpenseTracker.Application.Preferences;

public interface IPreferencesService
{
    /// <summary>The saved preferences as a JSON object ({} when nothing was saved yet).</summary>
    Task<JsonElement> GetAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Merges the keys of <paramref name="patch"/> into the saved preferences. A key set to null is removed.
    /// Returns the merged result.
    /// </summary>
    Task<JsonElement> UpdateAsync(JsonElement patch, CancellationToken cancellationToken);
}