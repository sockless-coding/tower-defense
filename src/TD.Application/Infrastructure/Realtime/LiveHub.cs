using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.JsonWebTokens;
using TD.Application.Infrastructure.Auth;

namespace TD.Application.Infrastructure.Realtime;

/// <summary>Server-to-client push channel. Clients never send game state through the hub.</summary>
public interface ILiveClient
{
    Task ProfileChanged(ProfileChangedMessage message);
    Task SaveGameChanged(SaveGameChangedMessage message);
    Task LeaderboardUpdated(LeaderboardUpdatedMessage message);
    Task EventRotated(EventRotatedMessage message);
}

public sealed record ProfileChangedMessage(long Version);
public sealed record SaveGameChangedMessage(int Slot, long Version);
public sealed record LeaderboardUpdatedMessage(string BoardKey);
public sealed record EventRotatedMessage(string Kind, string Key);

[Authorize(Policy = AuthPolicies.Player)]
public sealed class LiveHub : Hub<ILiveClient>
{
    public const string Path = "/hubs/live";

    public static string AccountGroup(Guid accountId) => $"acct:{accountId:N}";
    public static string LeaderboardGroup(string boardKey) => $"lb:{boardKey}";

    public override async Task OnConnectedAsync()
    {
        var sub = Context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (Guid.TryParse(sub, out var accountId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AccountGroup(accountId));
        }

        await base.OnConnectedAsync();
    }

    /// <summary>Subscribe to live updates for a leaderboard the client is viewing.</summary>
    public Task WatchLeaderboard(string boardKey) =>
        boardKey.Length is > 0 and <= 128
            ? Groups.AddToGroupAsync(Context.ConnectionId, LeaderboardGroup(boardKey))
            : Task.CompletedTask;

    public Task UnwatchLeaderboard(string boardKey) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, LeaderboardGroup(boardKey));
}

/// <summary>Lets feature handlers push notifications without depending on SignalR types.</summary>
public sealed class LiveNotifier(IHubContext<LiveHub, ILiveClient> hub, ILogger<LiveNotifier> logger)
{
    public Task ProfileChanged(Guid accountId, long version) =>
        Safe(() => hub.Clients.Group(LiveHub.AccountGroup(accountId)).ProfileChanged(new ProfileChangedMessage(version)));

    public Task SaveGameChanged(Guid accountId, int slot, long version) =>
        Safe(() => hub.Clients.Group(LiveHub.AccountGroup(accountId)).SaveGameChanged(new SaveGameChangedMessage(slot, version)));

    public Task LeaderboardUpdated(string boardKey) =>
        Safe(() => hub.Clients.Group(LiveHub.LeaderboardGroup(boardKey)).LeaderboardUpdated(new LeaderboardUpdatedMessage(boardKey)));

    public Task EventRotated(string kind, string key) =>
        Safe(() => hub.Clients.All.EventRotated(new EventRotatedMessage(kind, key)));

    // Notifications are best-effort: a push failure must never fail the request that caused it.
    private async Task Safe(Func<Task> send)
    {
        try
        {
            await send();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Live notification failed");
        }
    }
}
