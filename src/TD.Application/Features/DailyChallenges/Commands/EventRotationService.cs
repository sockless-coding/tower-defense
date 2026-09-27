using TD.Application.Features.Campaign;
using TD.Application.Infrastructure.Realtime;

namespace TD.Application.Features.DailyChallenges;

/// <summary>Pushes a live notification to connected clients when the daily challenge or weekly event rolls over.</summary>
public sealed class EventRotationService(LiveNotifier live, TimeProvider clock, ILogger<EventRotationService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var daily = ModeLevels.DailyKey(now);
        var weekly = ModeLevels.WeeklyKey(now);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            now = clock.GetUtcNow().UtcDateTime;
            var nextDaily = ModeLevels.DailyKey(now);
            var nextWeekly = ModeLevels.WeeklyKey(now);
            if (nextDaily != daily)
            {
                daily = nextDaily;
                logger.LogInformation("Daily challenge rotated to {Key}", daily);
                await live.EventRotated("daily", daily);
            }

            if (nextWeekly != weekly)
            {
                weekly = nextWeekly;
                logger.LogInformation("Weekly event rotated to {Key}", weekly);
                await live.EventRotated("weekly", weekly);
            }
        }
    }
}
