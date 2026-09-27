using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.DailyChallenges;

public sealed class EventEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/events", async (GetEventsHandler handler, CancellationToken ct) => TypedResults.Ok(await handler.Handle(ct)))
            .WithTags("Events")
            .RequireAuthorization(AuthPolicies.Player);
    }
}
