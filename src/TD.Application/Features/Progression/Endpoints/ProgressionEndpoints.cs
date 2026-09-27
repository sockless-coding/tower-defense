using TD.Application.Features.Research;
using TD.Application.Features.Towers;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.RateLimiting;
using TD.Application.Infrastructure.Validation;

namespace TD.Application.Features.Progression;

public sealed class ProgressionEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").RequireAuthorization(AuthPolicies.Player);

        group.MapGet("/progression", async (GetProgressionHandler handler, CancellationToken ct) =>
                (await handler.Handle(ct)).ToHttpResult())
            .WithTags("Progression");

        group.MapPut("/progression/cosmetics", async (SelectCosmeticsRequest request, SelectCosmeticsHandler handler, CancellationToken ct) =>
                (await handler.Handle(request, ct)).ToHttpResult())
            .WithTags("Progression")
            .Validate<SelectCosmeticsRequest>()
            .RequireRateLimiting(RateLimitPolicies.Mutation);

        group.MapPost("/research/{nodeId}/purchase", async (string nodeId, PurchaseResearchHandler handler, CancellationToken ct) =>
                (await handler.Handle(nodeId, ct)).ToHttpResult())
            .WithTags("Research")
            .RequireRateLimiting(RateLimitPolicies.Mutation);

        group.MapPost("/towers/{towerId}/prestige", async (string towerId, PurchasePrestigeHandler handler, CancellationToken ct) =>
                (await handler.Handle(towerId, ct)).ToHttpResult())
            .WithTags("Towers")
            .RequireRateLimiting(RateLimitPolicies.Mutation);
    }
}
