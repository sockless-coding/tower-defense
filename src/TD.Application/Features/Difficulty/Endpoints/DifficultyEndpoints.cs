using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Validation;

namespace TD.Application.Features.Difficulty;

public sealed class DifficultyEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/difficulty").WithTags("Difficulty").AllowAnonymous();

        group.MapGet("/", (GetDifficultyCatalogHandler handler) => TypedResults.Ok(handler.Handle()));

        group.MapPost("/evaluate", (DifficultyModifiers modifiers, EvaluateDifficultyHandler handler) =>
                TypedResults.Ok(handler.Handle(modifiers)))
            .Validate<DifficultyModifiers>();
    }
}
