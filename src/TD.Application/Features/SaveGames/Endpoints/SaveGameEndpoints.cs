using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.RateLimiting;
using TD.Application.Infrastructure.Validation;

namespace TD.Application.Features.SaveGames;

public sealed class SaveGameEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/saves").WithTags("SaveGames").RequireAuthorization(AuthPolicies.Player);

        group.MapGet("/", async (ListSaveGamesHandler handler, CancellationToken ct) => TypedResults.Ok(await handler.Handle(ct)));

        group.MapGet("/{slot:int}", async (int slot, GetSaveGameHandler handler, CancellationToken ct) =>
            (await handler.Handle(slot, ct)).ToHttpResult());

        group.MapPut("/{slot:int}", async (int slot, PutSaveGameRequest request, PutSaveGameHandler handler, CancellationToken ct) =>
                (await handler.Handle(slot, request, ct)).ToHttpResult())
            .Validate<PutSaveGameRequest>()
            .RequireRateLimiting(RateLimitPolicies.Mutation);

        group.MapDelete("/{slot:int}", async (int slot, DeleteSaveGameHandler handler, CancellationToken ct) =>
                (await handler.Handle(slot, ct)).ToHttpResult(_ => TypedResults.NoContent()))
            .RequireRateLimiting(RateLimitPolicies.Mutation);
    }
}
