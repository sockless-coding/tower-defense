using TD.Application.Features.Content;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Enemies;

public sealed class GetEnemiesHandler(ContentCatalog catalog) : IHandler
{
    public IReadOnlyList<EnemyDefinition> Handle() => catalog.Current.Enemies;
}

public sealed class GetEnemyHandler(ContentCatalog catalog) : IHandler
{
    public Result<EnemyDefinition> Handle(string id) =>
        catalog.Current.EnemiesById.TryGetValue(id, out var enemy)
            ? enemy
            : Error.NotFound("enemy.not_found", $"Enemy '{id}' does not exist.");
}
