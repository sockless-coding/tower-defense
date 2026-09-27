using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Towers;

public sealed class TowerEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/towers").WithTags("Towers").AllowAnonymous();
        group.MapGet("/", (GetTowersHandler handler, TowerCategory? category) => TypedResults.Ok(handler.Handle(category)));
        group.MapGet("/{id}", (string id, GetTowerHandler handler) => handler.Handle(id).ToHttpResult());
    }
}
