using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Statistics;

public sealed class StatisticsEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/statistics", async (GetStatisticsHandler handler, CancellationToken ct) => TypedResults.Ok(await handler.Handle(ct)))
            .WithTags("Statistics")
            .RequireAuthorization(AuthPolicies.Player);
    }
}
