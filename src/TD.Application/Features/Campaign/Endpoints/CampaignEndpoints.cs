using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Campaign;

public sealed class CampaignEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/levels").WithTags("Campaign").AllowAnonymous();

        group.MapGet("/", (GetLevelsHandler handler, GameMode? mode) => TypedResults.Ok(handler.Handle(mode)));

        group.MapGet("/{id}", (string id, GetLevelHandler handler) => handler.Handle(id).ToHttpResult());
    }
}
