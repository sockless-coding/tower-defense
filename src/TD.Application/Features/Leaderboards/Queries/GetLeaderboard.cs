using Microsoft.EntityFrameworkCore;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Leaderboards;

public sealed record LeaderboardRow(int Rank, string DisplayName, long Score, int Waves, int Stars, DateTime AchievedAt, bool IsMe);

public sealed record LeaderboardView(string BoardKey, int Entries, IReadOnlyList<LeaderboardRow> Top, LeaderboardRow? Me);

public sealed class GetLeaderboardHandler(AppDbContext db, ICurrentUser currentUser) : IHandler
{
    public const int MaxTop = 100;

    public async Task<Result<LeaderboardView>> Handle(string boardKey, int top, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(boardKey) || boardKey.Length > 96)
        {
            return Error.Validation("leaderboard.key", "Invalid leaderboard.");
        }

        var take = Math.Clamp(top, 1, MaxTop);
        var me = currentUser.AccountIdOrNull;
        var board = db.LeaderboardEntries.AsNoTracking().Where(e => e.BoardKey == boardKey);

        var rows = await board
            .OrderByDescending(e => e.Score)
            .ThenBy(e => e.AchievedAt)
            .Take(take)
            .Select(e => new { e.AccountId, e.DisplayName, e.Score, e.Waves, e.Stars, e.AchievedAt })
            .ToListAsync(ct);

        var topRows = rows.Select((r, i) => new LeaderboardRow(i + 1, r.DisplayName, r.Score, r.Waves, r.Stars, r.AchievedAt, r.AccountId == me)).ToList();
        LeaderboardRow? mine = topRows.FirstOrDefault(r => r.IsMe);
        if (mine is null && me is not null)
        {
            var own = await board.Where(e => e.AccountId == me).SingleOrDefaultAsync(ct);
            if (own is not null)
            {
                var rank = await board.CountAsync(e => e.Score > own.Score, ct) + 1;
                mine = new LeaderboardRow(rank, own.DisplayName, own.Score, own.Waves, own.Stars, own.AchievedAt, true);
            }
        }

        return new LeaderboardView(boardKey, await board.CountAsync(ct), topRows, mine);
    }
}
