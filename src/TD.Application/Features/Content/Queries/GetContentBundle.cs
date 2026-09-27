using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Content;

public sealed class GetContentBundleHandler(ContentCatalog catalog) : IHandler
{
    public string Version => catalog.Current.Version;

    public ContentBundle Handle()
    {
        var c = catalog.Current;
        return new ContentBundle(
            c.Version,
            c.Rules,
            c.Towers,
            c.Enemies,
            c.Maps,
            c.Difficulty,
            c.Research,
            c.Achievements,
            c.Commander,
            c.Campaign.Select(LevelSummary.From).ToList(),
            c.Challenges.Select(LevelSummary.From).ToList());
    }
}
