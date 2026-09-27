using TD.Application.Features.Content;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Towers;

public sealed class GetTowersHandler(ContentCatalog catalog) : IHandler
{
    public IReadOnlyList<TowerDefinition> Handle(TowerCategory? category) =>
        catalog.Current.Towers.Where(t => category is null || t.Category == category).ToList();
}

public sealed class GetTowerHandler(ContentCatalog catalog) : IHandler
{
    public Result<TowerDefinition> Handle(string id) =>
        catalog.Current.TowersById.TryGetValue(id, out var tower)
            ? tower
            : Error.NotFound("tower.not_found", $"Tower '{id}' does not exist.");
}
