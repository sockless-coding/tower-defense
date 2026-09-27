using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Leaderboards;

public sealed class LeaderboardEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/leaderboards/{boardKey}", async (string boardKey, int? top, GetLeaderboardHandler handler, CancellationToken ct) =>
                (await handler.Handle(boardKey, top ?? 50, ct)).ToHttpResult())
            .WithTags("Leaderboards")
            .RequireAuthorization(AuthPolicies.Player);
    }
}
