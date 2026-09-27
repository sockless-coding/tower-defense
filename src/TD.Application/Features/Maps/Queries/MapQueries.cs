using TD.Application.Features.Content;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Maps;

public sealed class GetMapsHandler(ContentCatalog catalog) : IHandler
{
    public IReadOnlyList<MapDefinition> Handle() => catalog.Current.Maps;
}

public sealed class GetMapHandler(ContentCatalog catalog) : IHandler
{
    public Result<MapDefinition> Handle(string id) =>
        catalog.Current.MapsById.TryGetValue(id, out var map)
            ? map
            : Error.NotFound("map.not_found", $"Map '{id}' does not exist.");
}
