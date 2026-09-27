using Microsoft.AspNetCore.Mvc;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.RateLimiting;
using TD.Application.Infrastructure.Validation;

namespace TD.Application.Features.Sessions;

public sealed class SessionEndpoints : IEndpointModule
{
    public const string TokenHeader = "X-Session-Token";

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/sessions")
            .WithTags("Sessions")
            .RequireAuthorization(AuthPolicies.Player)
            .RequireRateLimiting(RateLimitPolicies.GameSession);

        group.MapPost("/", async (StartSessionRequest request, StartSessionHandler handler, CancellationToken ct) =>
                (await handler.Handle(request, ct)).ToHttpResult())
            .Validate<StartSessionRequest>();

        group.MapGet("/{id:guid}", async (Guid id, GetSessionHandler handler, CancellationToken ct) =>
            (await handler.Handle(id, ct)).ToHttpResult());

        group.MapPost("/{id:guid}/complete", async (
                    Guid id,
                    [FromHeader(Name = TokenHeader)] string? token,
                    CompleteSessionRequest request,
                    CompleteSessionHandler handler,
                    CancellationToken ct) =>
                (await handler.Handle(id, token, request, ct)).ToHttpResult())
            .Validate<CompleteSessionRequest>();

        group.MapPost("/{id:guid}/abandon", async (Guid id, AbandonSessionHandler handler, CancellationToken ct) =>
            (await handler.Handle(id, ct)).ToHttpResult(_ => TypedResults.NoContent()));
    }
}
