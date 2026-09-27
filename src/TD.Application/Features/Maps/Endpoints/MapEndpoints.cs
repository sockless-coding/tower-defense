using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Maps;

public sealed class MapEndpointModule : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/maps").WithTags("Maps").AllowAnonymous();
        group.MapGet("/", (GetMapsHandler handler) => TypedResults.Ok(handler.Handle()));
        group.MapGet("/{id}", (string id, GetMapHandler handler) => handler.Handle(id).ToHttpResult());
    }
}
