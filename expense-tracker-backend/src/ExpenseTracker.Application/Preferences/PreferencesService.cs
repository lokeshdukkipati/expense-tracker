using System.Text.Json;
using System.Text.Json.Nodes;
using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Preferences;

public sealed class PreferencesService(IAppDbContext db, ICurrentUser currentUser) : IPreferencesService
{
    private const int MaxDocumentChars = 32_000;
    private const int MaxKeys = 50;
    private const int MaxDepth = 16;
    private const int MaxSaveAttempts = 3;

    public async Task<JsonElement> GetAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var json = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.PreferencesJson)
            .FirstOrDefaultAsync(cancellationToken);

        return ToElement(json ?? "{}");
    }

    public async Task<JsonElement> UpdateAsync(JsonElement patch, CancellationToken cancellationToken)
    {
        if (patch.ValueKind != JsonValueKind.Object)
        {
            throw new BusinessRuleException("Preferences must be a JSON object.", "invalid_preferences");
        }

        var raw = patch.GetRawText();
        if (raw.Length > MaxDocumentChars)
        {
            throw new BusinessRuleException("The preferences are too large.", "preferences_too_large");
        }

        var patchNode = ParseObject(raw);
        Validate(patchNode);

        var userId = currentUser.UserId;

        for (var attempt = 1; ; attempt++)
        {
            var user = await db.Users.FirstAsync(u => u.Id == userId, cancellationToken);
            var current = user.PreferencesJson is null ? new JsonObject() : ParseObject(user.PreferencesJson);

            foreach (var (key, value) in patchNode)
            {
                if (value is null)
                {
                    current.Remove(key);
                }
                else
                {
                    current[key] = value.DeepClone();
                }
            }

            if (current.Count > MaxKeys)
            {
                throw new BusinessRuleException("Too many preference keys.", "preferences_too_large");
            }

            var merged = current.ToJsonString();
            if (merged.Length > MaxDocumentChars)
            {
                throw new BusinessRuleException("The preferences are too large.", "preferences_too_large");
            }

            user.PreferencesJson = current.Count == 0 ? null : merged;

            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return ToElement(current.Count == 0 ? "{}" : merged);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxSaveAttempts)
            {
                // Another device saved at the same moment: reload and merge again.
                db.ChangeTracker.Clear();
            }
        }
    }

    private static JsonObject ParseObject(string json)
    {
        try
        {
            return JsonNode.Parse(json, documentOptions: new JsonDocumentOptions { MaxDepth = MaxDepth }) as JsonObject
                   ?? throw new BusinessRuleException("Preferences must be a JSON object.", "invalid_preferences");
        }
        catch (JsonException)
        {
            throw new BusinessRuleException("The preferences are not valid or are nested too deeply.", "invalid_preferences");
        }
    }

    private static void Validate(JsonObject patch)
    {
        if (patch.Count > MaxKeys)
        {
            throw new BusinessRuleException("Too many preference keys.", "preferences_too_large");
        }

        foreach (var (key, _) in patch)
        {
            var validKey = key.Length is >= 1 and <= 40
                           && char.IsAsciiLetter(key[0])
                           && key.All(c => char.IsAsciiLetterOrDigit(c) || c == '_');
            if (!validKey)
            {
                throw new BusinessRuleException(
                    $"'{key}' is not a valid preference name. Use letters, digits and '_', starting with a letter (max 40).",
                    "invalid_preferences");
            }
        }

        if (patch.TryGetPropertyValue("theme", out var themeNode) && themeNode is not null)
        {
            var valid = themeNode is JsonValue value
                        && value.TryGetValue<string>(out var theme)
                        && (theme is "light" or "dark" or "system");
            if (!valid)
            {
                throw new BusinessRuleException("Theme must be 'light', 'dark' or 'system'.", "invalid_preferences");
            }
        }
    }

    private static JsonElement ToElement(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}