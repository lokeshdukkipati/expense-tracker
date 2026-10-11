using System.Text;

namespace ExpenseTracker.Application.Imports;

/// <summary>
/// Makes imported text safe to store without ever rejecting a row for being long.
/// A description over the limit is cut and the remainder moves to the front of the note; a note over its limit is
/// shortened with an ellipsis. The result is deterministic, so importing the same file again yields the same fingerprints.
/// </summary>
public static class ImportTextFitter
{
    public const int MaxDescription = 500;
    public const int MaxNote = 2000;

    private const string Continued = "(continued) ";

    /// <summary>Removes characters PostgreSQL cannot store: NUL and other control characters, and unpaired surrogates.</summary>
    public static string? Clean(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        var builder = new StringBuilder(value.Length);
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                builder.Append(c).Append(value[++i]);
            }
            else if (char.IsSurrogate(c))
            {
                builder.Append('\uFFFD');
            }
            else if (c is '\n' or '\t' || !char.IsControl(c))
            {
                builder.Append(c);
            }
        }

        return builder.ToString();
    }

    public static ParsedRow Fit(ParsedRow row)
    {
        var description = row.Description;
        var note = row.Note;

        if (description is { Length: > MaxDescription })
        {
            var overflow = description[MaxDescription..].Trim();
            description = description[..MaxDescription].TrimEnd();

            if (overflow.Length > 0)
            {
                var continued = Continued + overflow;
                note = string.IsNullOrEmpty(note) ? continued : continued + "\n" + note;
            }
        }

        if (note is { Length: > MaxNote })
        {
            note = note[..(MaxNote - 1)].TrimEnd() + "…";
        }

        return ReferenceEquals(description, row.Description) && ReferenceEquals(note, row.Note)
            ? row
            : row with { Description = description, Note = note };
    }
}