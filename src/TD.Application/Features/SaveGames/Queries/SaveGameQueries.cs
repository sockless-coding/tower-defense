using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Content;
using TD.Application.Features.Sessions;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.SaveGames;

public sealed class ListSaveGamesHandler(AppDbContext db, ICurrentUser currentUser) : IHandler
{
    public async Task<IReadOnlyList<SaveGameSummary>> Handle(CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        // Saves whose session has ended can no longer be resumed; they are hidden (and cleaned up lazily).
        var saves = await db.SaveGames.AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .Join(db.GameSessions.Where(g => g.Status == SessionStatus.Active), s => s.SessionId, g => g.Id, (s, _) => s)
            .OrderBy(s => s.Slot)
            .ToListAsync(ct);
        return saves.Select(s => new SaveGameSummary(s.Slot, s.SessionId, s.Tick, s.Summary, s.UpdatedAt, s.Version)).ToList();
    }
}

public sealed class GetSaveGameHandler(AppDbContext db, ICurrentUser currentUser) : IHandler
{
    public async Task<Result<SaveGameDetails>> Handle(int slot, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var save = await db.SaveGames.AsNoTracking().SingleOrDefaultAsync(s => s.AccountId == accountId && s.Slot == slot, ct);
        if (save is null)
        {
            return Error.NotFound("save.not_found", "That slot is empty.");
        }

        var actions = JsonSerializer.Deserialize<List<ActionDto>>(save.ActionsJson, ContentJson.Options) ?? [];
        return new SaveGameDetails(save.Slot, save.SessionId, save.Tick, actions, save.Summary, save.UpdatedAt, save.Version);
    }
}
