using TD.Application.Features.Content;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Campaign;

public sealed class GetLevelsHandler(ContentCatalog catalog) : IHandler
{
    public IReadOnlyList<LevelSummary> Handle(GameMode? mode)
    {
        var c = catalog.Current;
        var levels = mode switch
        {
            GameMode.Campaign => c.Campaign,
            GameMode.Challenge => c.Challenges,
            _ => c.Campaign.Concat(c.Challenges).ToList(),
        };
        return levels.Select(LevelSummary.From).ToList();
    }
}

/// <summary>Full level definition including waves, for briefing screens and wave previews.</summary>
public sealed class GetLevelHandler(ContentCatalog catalog) : IHandler
{
    public Result<LevelDefinition> Handle(string id) =>
        catalog.Current.LevelsById.TryGetValue(id, out var level)
            ? level
            : Error.NotFound("level.not_found", $"Level '{id}' does not exist.");
}
