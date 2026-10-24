using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Rules;

public sealed class RuleService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<CreateRuleRequest> createValidator,
    IValidator<UpdateRuleRequest> updateValidator) : IRuleService
{
    private const int MaxRules = 500;
    private const int MaxMatchTextLength = 500;
    private const int UpdateChunkSize = 1_000;

    public async Task<IReadOnlyList<RuleDto>> ListAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        return await db.CategoryRules.AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderBy(r => r.Type).ThenBy(r => r.Priority).ThenBy(r => r.Pattern)
            .Select(r => new RuleDto(
                r.Id, r.Pattern, r.MatchType, r.Type, r.CategoryId,
                r.Category.Name, r.Category.Parent == null ? null : r.Category.Parent.Name,
                r.Priority, r.IsActive, r.TimesApplied, r.RowVersion))
            .ToListAsync(cancellationToken);
    }

    public async Task<RuleDto> CreateAsync(CreateRuleRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var pattern = CategoryRuleMatcher.Normalize(request.Pattern);
        await EnsureCategoryAsync(userId, request.CategoryId, request.Type, cancellationToken);

        if (await db.CategoryRules.CountAsync(r => r.UserId == userId, cancellationToken) >= MaxRules)
        {
            throw new BusinessRuleException($"You can have at most {MaxRules} rules.", "rule_limit");
        }

        var exists = await db.CategoryRules.AnyAsync(
            r => r.UserId == userId && r.Type == request.Type && r.MatchType == request.MatchType && r.Pattern == pattern,
            cancellationToken);
        if (exists)
        {
            throw new ConflictException("A rule for this text already exists.", "rule_exists");
        }

        var rule = new CategoryRule
        {
            UserId = userId,
            Pattern = pattern,
            MatchType = request.MatchType,
            Type = request.Type,
            CategoryId = request.CategoryId,
            Priority = request.Priority
        };

        db.CategoryRules.Add(rule);
        await db.SaveChangesAsync(cancellationToken);

        return await GetDtoAsync(rule.Id, userId, cancellationToken);
    }

    public async Task<RuleDto> UpdateAsync(Guid id, UpdateRuleRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var rule = await db.CategoryRules.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(CategoryRule), id);

        db.Entry(rule).Property(r => r.RowVersion).OriginalValue = request.Version;

        var pattern = CategoryRuleMatcher.Normalize(request.Pattern);
        await EnsureCategoryAsync(userId, request.CategoryId, rule.Type, cancellationToken);

        var type = rule.Type;
        var exists = await db.CategoryRules.AnyAsync(
            r => r.UserId == userId && r.Id != id && r.Type == type && r.MatchType == request.MatchType && r.Pattern == pattern,
            cancellationToken);
        if (exists)
        {
            throw new ConflictException("A rule for this text already exists.", "rule_exists");
        }

        rule.Pattern = pattern;
        rule.MatchType = request.MatchType;
        rule.CategoryId = request.CategoryId;
        rule.Priority = request.Priority;
        rule.IsActive = request.IsActive;

        await db.SaveChangesAsync(cancellationToken);
        return await GetDtoAsync(id, userId, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var deleted = await db.CategoryRules.Where(r => r.Id == id && r.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        if (deleted == 0)
        {
            throw new NotFoundException(nameof(CategoryRule), id);
        }
    }

    public async Task<RuleMatchResultDto> MatchAsync(TransactionType type, string? text, CancellationToken cancellationToken)
    {
        if (type is not (TransactionType.Expense or TransactionType.Income))
        {
            throw new BusinessRuleException("Rules apply to expenses or income.", "rule_type_invalid");
        }

        if (text is { Length: > MaxMatchTextLength })
        {
            text = text[..MaxMatchTextLength];
        }

        var userId = currentUser.UserId;
        var rules = await db.CategoryRules.AsNoTracking()
            .Where(r => r.UserId == userId && r.IsActive && r.Type == type && !r.Category.IsArchived)
            .Select(r => new RuleCandidate(r.Id, r.Pattern, r.MatchType, r.Type, r.Priority, r.CategoryId))
            .ToListAsync(cancellationToken);

        var match = CategoryRuleMatcher.FindFirst(CategoryRuleMatcher.Order(rules), type, text);
        if (match is null)
        {
            return new RuleMatchResultDto(null);
        }

        var category = await db.Categories.AsNoTracking()
            .Where(c => c.Id == match.CategoryId)
            .Select(c => new { c.Name, ParentName = c.Parent == null ? null : c.Parent.Name })
            .FirstAsync(cancellationToken);

        return new RuleMatchResultDto(new RuleMatchDto(match.Id, match.Pattern, match.CategoryId, category.Name, category.ParentName));
    }

    public async Task<ApplyRuleResultDto> ApplyAsync(Guid id, ApplyRuleRequest request, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var rule = await db.CategoryRules.AsNoTracking()
                       .FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(CategoryRule), id);

        var type = rule.Type;
        var categoryId = rule.CategoryId;

        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.Type == type && t.CategoryId != categoryId && t.Description != null)
            .Select(t => new { t.Id, t.Description })
            .ToListAsync(cancellationToken);

        // Matched in memory with the same logic imports use, so both always agree.
        var matchedIds = rows
            .Where(r => CategoryRuleMatcher.IsMatch(rule.MatchType, rule.Pattern, CategoryRuleMatcher.Normalize(r.Description)))
            .Select(r => r.Id)
            .ToList();

        if (request.DryRun || matchedIds.Count == 0)
        {
            return new ApplyRuleResultDto(matchedIds.Count, 0);
        }

        var now = clock.GetUtcNow();
        var updated = 0;

        await db.ExecuteInTransactionAsync(async () =>
        {
            updated = 0;

            foreach (var chunk in matchedIds.Chunk(UpdateChunkSize))
            {
                updated += await db.Transactions
                    .Where(t => t.UserId == userId && chunk.Contains(t.Id))
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(t => t.CategoryId, categoryId)
                        .SetProperty(t => t.UpdatedAt, now), cancellationToken);
            }

            var applied = updated;
            await db.CategoryRules
                .Where(r => r.Id == id && r.UserId == userId)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.TimesApplied, r => r.TimesApplied + applied), cancellationToken);
        }, cancellationToken);

        return new ApplyRuleResultDto(matchedIds.Count, updated);
    }

    private async Task EnsureCategoryAsync(Guid userId, Guid categoryId, TransactionType type, CancellationToken cancellationToken)
    {
        var category = await db.Categories.AsNoTracking()
                           .FirstOrDefaultAsync(c => c.Id == categoryId && c.UserId == userId, cancellationToken)
                       ?? throw new NotFoundException(nameof(Category), categoryId);

        if (category.IsSystem || category.Type != type)
        {
            throw new BusinessRuleException($"Choose a regular {type.ToString().ToLowerInvariant()} category.", "rule_category_type");
        }

        if (category.IsArchived)
        {
            throw new BusinessRuleException("This category is archived. Choose another category.", "category_archived");
        }
    }

    private async Task<RuleDto> GetDtoAsync(Guid id, Guid userId, CancellationToken cancellationToken) =>
        await db.CategoryRules.AsNoTracking()
            .Where(r => r.Id == id && r.UserId == userId)
            .Select(r => new RuleDto(
                r.Id, r.Pattern, r.MatchType, r.Type, r.CategoryId,
                r.Category.Name, r.Category.Parent == null ? null : r.Category.Parent.Name,
                r.Priority, r.IsActive, r.TimesApplied, r.RowVersion))
            .FirstOrDefaultAsync(cancellationToken)
        ?? throw new NotFoundException(nameof(CategoryRule), id);
}