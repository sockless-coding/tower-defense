using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Enemies;

public sealed class EnemyEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/enemies").WithTags("Enemies").AllowAnonymous();
        group.MapGet("/", (GetEnemiesHandler handler) => TypedResults.Ok(handler.Handle()));
        group.MapGet("/{id}", (string id, GetEnemyHandler handler) => handler.Handle(id).ToHttpResult());
    }
}
