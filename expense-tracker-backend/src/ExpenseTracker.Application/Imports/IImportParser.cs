namespace ExpenseTracker.Application.Imports;

/// <summary>
/// One implementation per supported file layout. Add a new parser and register it in DI to support a new format;
/// duplicate detection, preview and commit are shared.
/// </summary>
public interface IImportParser
{
    string FormatName { get; }

    bool CanParse(string fileName);

    /// <summary>Parses the whole file. Throws <c>BusinessRuleException</c> when the layout is not recognised.</summary>
    Task<ParseResult> ParseAsync(Stream content, CancellationToken cancellationToken);
}
