using System.Diagnostics;
using System.Diagnostics.Metrics;
using OpenTelemetry.Logs;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using OpenTelemetry.Metrics;

namespace TD.Application.Infrastructure.Telemetry;

/// <summary>Custom game metrics and traces, exported through OpenTelemetry.</summary>
public sealed class GameTelemetry : IDisposable
{
    public const string SourceName = "SocklessTD";

    public static readonly ActivitySource ActivitySource = new(SourceName);

    private readonly Meter _meter;

    public GameTelemetry(IMeterFactory meterFactory)
    {
        _meter = meterFactory.Create(SourceName);
        AccountsCreated = _meter.CreateCounter<long>("td.accounts.created", description: "Accounts created, tagged by kind");
        SessionsStarted = _meter.CreateCounter<long>("td.sessions.started", description: "Level sessions started, tagged by mode");
        SessionsCompleted = _meter.CreateCounter<long>("td.sessions.completed", description: "Level sessions completed, tagged by mode and outcome");
        SessionsRejected = _meter.CreateCounter<long>("td.sessions.rejected", description: "Session completions rejected by anti-cheat, tagged by reason");
        ResearchPurchased = _meter.CreateCounter<long>("td.research.purchased", description: "Research nodes purchased");
        SessionDuration = _meter.CreateHistogram<double>("td.sessions.duration", unit: "s", description: "Wall-clock duration of completed sessions");
    }

    public Counter<long> AccountsCreated { get; }
    public Counter<long> SessionsStarted { get; }
    public Counter<long> SessionsCompleted { get; }
    public Counter<long> SessionsRejected { get; }
    public Counter<long> ResearchPurchased { get; }
    public Histogram<double> SessionDuration { get; }

    public void Dispose() => _meter.Dispose();
}

public static class TelemetryExtensions
{
    public static WebApplicationBuilder AddAppTelemetry(this WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton<GameTelemetry>();

        // The OTLP exporter reads OTEL_EXPORTER_OTLP_ENDPOINT itself; we only decide whether to enable it.
        var useOtlp = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
        var useConsole = builder.Configuration.GetValue("Telemetry:ConsoleExporter", false);

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
            if (useOtlp) logging.AddOtlpExporter();
        });

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService("sockless-td-api"))
            .WithTracing(tracing =>
            {
                tracing.AddSource(GameTelemetry.SourceName)
                    .AddAspNetCoreInstrumentation(o => o.RecordException = true)
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation();
                if (useOtlp) tracing.AddOtlpExporter();
                if (useConsole) tracing.AddConsoleExporter();
            })
            .WithMetrics(metrics =>
            {
                metrics.AddMeter(GameTelemetry.SourceName, "System.Runtime")
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation();
                if (useOtlp) metrics.AddOtlpExporter();
                if (useConsole) metrics.AddConsoleExporter();
            });

        return builder;
    }
}
