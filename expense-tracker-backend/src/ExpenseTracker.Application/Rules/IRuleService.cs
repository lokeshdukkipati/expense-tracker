using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Rules;

public interface IRuleService
{
    Task<IReadOnlyList<RuleDto>> ListAsync(CancellationToken cancellationToken);

    Task<RuleDto> CreateAsync(CreateRuleRequest request, CancellationToken cancellationToken);

    Task<RuleDto> UpdateAsync(Guid id, UpdateRuleRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>Which rule (if any) would categorise this text? Used while typing a quick-add entry.</summary>
    Task<RuleMatchResultDto> MatchAsync(TransactionType type, string? text, CancellationToken cancellationToken);

    /// <summary>Re-categorises existing transactions whose description matches the rule.</summary>
    Task<ApplyRuleResultDto> ApplyAsync(Guid id, ApplyRuleRequest request, CancellationToken cancellationToken);
}