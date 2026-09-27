using TD.Application.Features.Content;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Difficulty;

public sealed record DifficultyEvaluation(double RewardMultiplier, IReadOnlyList<string> Errors);

public sealed class GetDifficultyCatalogHandler(ContentCatalog catalog) : IHandler
{
    public DifficultyCatalog Handle() => catalog.Current.Difficulty;
}

/// <summary>Previews the reward multiplier for a custom modifier set. The same math runs again at session start.</summary>
public sealed class EvaluateDifficultyHandler(ContentCatalog catalog) : IHandler
{
    public DifficultyEvaluation Handle(DifficultyModifiers modifiers)
    {
        var ranges = catalog.Current.Difficulty.Ranges;
        var errors = DifficultyMath.Validate(modifiers, ranges).ToList();
        return new DifficultyEvaluation(errors.Count == 0 ? DifficultyMath.RewardMultiplier(modifiers, ranges) : 0, errors);
    }
}
