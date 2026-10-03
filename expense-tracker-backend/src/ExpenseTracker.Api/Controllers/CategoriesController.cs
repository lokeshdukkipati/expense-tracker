using ExpenseTracker.Application.Categories;
using ExpenseTracker.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

[ApiController]
[Route("api/v1/categories")]
[Produces("application/json")]
public sealed class CategoriesController(ICategoryService categories) : ControllerBase
{
    /// <summary>Flat list; subcategories carry their <c>parentId</c> so the client can build the tree.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CategoryDto>>> List(
        [FromQuery] TransactionType? type, [FromQuery] bool includeArchived, CancellationToken cancellationToken) =>
        Ok(await categories.ListAsync(type, includeArchived, cancellationToken));

    [HttpPost]
    [ProducesResponseType(typeof(CategoryDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<CategoryDto>> Create([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken)
    {
        var category = await categories.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, category);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CategoryDto>> Update(Guid id, [FromBody] UpdateCategoryRequest request, CancellationToken cancellationToken) =>
        Ok(await categories.UpdateAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await categories.DeleteAsync(id, cancellationToken);
        return NoContent();
    }
}
