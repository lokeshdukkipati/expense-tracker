using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Categories;

public sealed class CategoryService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IValidator<CreateCategoryRequest> createValidator,
    IValidator<UpdateCategoryRequest> updateValidator) : ICategoryService
{
    public async Task<IReadOnlyList<CategoryDto>> ListAsync(TransactionType? type, bool includeArchived, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var query = db.Categories.AsNoTracking().Where(c => c.UserId == userId);
        if (type is { } t)
        {
            query = query.Where(c => c.Type == t);
        }

        if (!includeArchived)
        {
            query = query.Where(c => !c.IsArchived);
        }

        var categories = await query.OrderBy(c => c.Type).ThenBy(c => c.Name).ToListAsync(cancellationToken);
        return categories.Select(ToDto).ToList();
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var name = request.Name.Trim();

        if (request.ParentId is { } parentId)
        {
            var parent = await db.Categories.AsNoTracking()
                             .FirstOrDefaultAsync(c => c.Id == parentId && c.UserId == userId, cancellationToken)
                         ?? throw new NotFoundException(nameof(Category), parentId);

            if (parent.ParentId is not null)
            {
                throw new BusinessRuleException("Subcategories cannot have their own subcategories.", "category_depth_exceeded");
            }

            if (parent.Type != request.Type)
            {
                throw new BusinessRuleException("A subcategory must have the same type as its parent.", "category_type_mismatch");
            }
        }

        await EnsureNameAvailableAsync(userId, request.ParentId, request.Type, name, null, cancellationToken);

        var category = new Category
        {
            UserId = userId,
            Name = name,
            Type = request.Type,
            ParentId = request.ParentId,
            Color = string.IsNullOrWhiteSpace(request.Color) ? null : request.Color.ToUpperInvariant(),
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? null : request.Icon.Trim()
        };

        db.Categories.Add(category);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(category);
    }

    public async Task<CategoryDto> UpdateAsync(Guid id, UpdateCategoryRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken)
                       ?? throw new NotFoundException(nameof(Category), id);

        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(userId, category.ParentId, category.Type, name, id, cancellationToken);

        db.Entry(category).Property(c => c.RowVersion).OriginalValue = request.Version;

        category.Name = name;
        category.Color = string.IsNullOrWhiteSpace(request.Color) ? null : request.Color.ToUpperInvariant();
        category.Icon = string.IsNullOrWhiteSpace(request.Icon) ? null : request.Icon.Trim();
        category.IsArchived = request.IsArchived;

        await db.SaveChangesAsync(cancellationToken);
        return ToDto(category);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken)
                       ?? throw new NotFoundException(nameof(Category), id);

        if (await db.Categories.AnyAsync(c => c.ParentId == id && c.UserId == userId, cancellationToken))
        {
            throw new BusinessRuleException("Delete or move its subcategories first.", "category_has_subcategories");
        }

        var inUse = await db.Transactions.IgnoreQueryFilters()
            .AnyAsync(t => t.CategoryId == id && t.UserId == userId, cancellationToken);

        if (inUse)
        {
            throw new BusinessRuleException(
                "This category is used by transactions and cannot be deleted. Archive it instead.", "category_in_use");
        }

        db.Categories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureNameAvailableAsync(
        Guid userId, Guid? parentId, TransactionType type, string name, Guid? excludeId, CancellationToken cancellationToken)
    {
        var lower = name.ToLowerInvariant();
        var exists = await db.Categories.AnyAsync(
            c => c.UserId == userId
                 && c.ParentId == parentId
                 && c.Type == type
                 && c.Name.ToLower() == lower
                 && (excludeId == null || c.Id != excludeId),
            cancellationToken);

        if (exists)
        {
            throw new ConflictException($"A category named '{name}' already exists here.", "category_name_taken");
        }
    }

    private static CategoryDto ToDto(Category c) =>
        new(c.Id, c.Name, c.Type, c.ParentId, c.Color, c.Icon, c.IsArchived, c.RowVersion);
}
