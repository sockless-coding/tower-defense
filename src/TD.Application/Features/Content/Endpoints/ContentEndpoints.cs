using Microsoft.Net.Http.Headers;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Content;

public sealed class ContentEndpoints : IEndpointModule
{
    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        // Content is not secret: it is served anonymously so the title screen can render before sign-in.
        app.MapGet("/api/content", (HttpContext http, GetContentBundleHandler handler) =>
            {
                var etag = $"\"{handler.Version}\"";
                http.Response.Headers.ETag = etag;
                http.Response.Headers.CacheControl = "no-cache";

                if (http.Request.Headers.IfNoneMatch.Any(v => v == etag))
                {
                    return Results.StatusCode(StatusCodes.Status304NotModified);
                }

                return TypedResults.Ok(handler.Handle());
            })
            .WithTags("Content")
            .AllowAnonymous();
    }
}
