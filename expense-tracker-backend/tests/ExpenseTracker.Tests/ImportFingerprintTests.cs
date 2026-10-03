using ExpenseTracker.Application.Imports;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Tests;

public class ImportFingerprintTests
{
    private static readonly Guid UserA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static ParsedRow Row(
        int rowNumber = 2,
        decimal amount = 55.65m,
        string? description = "Skyview to pg uber bike",
        int second = 35) =>
        new(rowNumber, new DateTime(2026, 9, 29, 16, 36, second), TransactionType.Expense, amount, "INR",
            "Accounts", "Transportation", "Office-Travel", description, null);

    [Fact]
    public void Same_row_gives_same_fingerprint_regardless_of_row_number()
    {
        var a = ImportFingerprint.ComputeAll(UserA, [Row(rowNumber: 2)]);
        var b = ImportFingerprint.ComputeAll(UserA, [Row(rowNumber: 900)]);

        Assert.Equal(a[0], b[0]);
        Assert.Equal(64, a[0].Length);
    }

    [Fact]
    public void Different_amount_or_second_or_user_changes_the_fingerprint()
    {
        var baseline = ImportFingerprint.ComputeAll(UserA, [Row()])[0];

        Assert.NotEqual(baseline, ImportFingerprint.ComputeAll(UserA, [Row(amount: 56m)])[0]);
        Assert.NotEqual(baseline, ImportFingerprint.ComputeAll(UserA, [Row(second: 36)])[0]);
        Assert.NotEqual(baseline, ImportFingerprint.ComputeAll(UserB, [Row()])[0]);
    }

    [Fact]
    public void Case_and_extra_whitespace_in_text_are_ignored()
    {
        var a = ImportFingerprint.ComputeAll(UserA, [Row(description: "Skyview to pg uber bike")])[0];
        var b = ImportFingerprint.ComputeAll(UserA, [Row(description: "  SKYVIEW   to PG uber   bike ")])[0];

        Assert.Equal(a, b);
    }

    [Fact]
    public void Identical_rows_in_one_file_get_distinct_fingerprints()
    {
        var result = ImportFingerprint.ComputeAll(UserA, [Row(rowNumber: 2), Row(rowNumber: 3), Row(rowNumber: 4)]);

        Assert.Equal(3, result.Distinct().Count());
    }

    [Fact]
    public void A_newer_export_that_adds_rows_keeps_the_fingerprints_of_existing_rows()
    {
        var older = ImportFingerprint.ComputeAll(UserA, [Row(rowNumber: 2), Row(rowNumber: 3)]);
        var newer = ImportFingerprint.ComputeAll(UserA, [Row(rowNumber: 2, second: 50), Row(rowNumber: 3), Row(rowNumber: 4)]);

        // The two original identical rows still map to the same two fingerprints, so they are detected as duplicates.
        Assert.Contains(older[0], newer);
        Assert.Contains(older[1], newer);
        // Only the genuinely new row (different second) adds a fingerprint: 2 old + 1 new = 3 distinct.
        Assert.Equal(3, older.Concat(newer).Distinct().Count());
    }
}
