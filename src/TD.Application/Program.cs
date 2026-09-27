using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.HttpOverrides;
using TD.Application.Features.Content;
using TD.Application.Features.DailyChallenges;
using TD.Application.Features.Sessions;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.RateLimiting;
using TD.Application.Infrastructure.Realtime;
using TD.Application.Infrastructure.Telemetry;

var builder = WebApplication.CreateBuilder(args);
var assembly = typeof(Program).Assembly;

builder.AddAppTelemetry();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddAppDatabase(builder.Configuration);
builder.Services.AddAppAuthentication(builder.Configuration);
builder.Services.AddAppRateLimiting(builder.Configuration);
builder.Services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
builder.Services.AddFeatureHandlers(assembly);
builder.Services.AddScoped<AuditLog>();
builder.Services.AddContent();
builder.Services.AddGameSessions(builder.Configuration);
builder.Services.AddHostedService<EventRotationService>();
builder.Services.AddSingleton<LiveNotifier>();
builder.Services.AddSignalR();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/health").DisableRateLimiting();
app.MapFeatureEndpoints(assembly);
app.MapHub<LiveHub>(LiveHub.Path);

// Client-side routes fall back to the SPA shell; unknown API and hub routes stay 404.
app.MapFallbackToFile("{*path:nonfile:regex(^(?!api/|hubs/).*$)}", "index.html");

await app.Services.MigrateDatabaseAsync();
await app.Services.SeedContentAsync();
await app.RunAsync();

public partial class Program;
