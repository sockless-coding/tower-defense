using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Content;
using TD.Application.Features.Sessions;
using TD.Application.Infrastructure.Audit;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;
using TD.Application.Infrastructure.Realtime;

namespace TD.Application.Features.SaveGames;

public static class SaveSlots
{
    public const int Count = 3;

    public static bool IsValid(int slot) => slot is >= 1 and <= Count;
}

/// <summary>
/// Stores an in-progress run. Saves only reference active sessions the player owns; completing the session still goes
/// through full validation, so a save can never grant anything by itself.
/// </summary>
public sealed class PutSaveGameHandler(AppDbContext db, ICurrentUser currentUser, AuditLog audit, LiveNotifier live, TimeProvider clock) : IHandler
{
    public async Task<Result<SaveGameSummary>> Handle(int slot, PutSaveGameRequest request, CancellationToken ct)
    {
        if (!SaveSlots.IsValid(slot))
        {
            return Error.Validation("save.slot", $"Slot must be between 1 and {SaveSlots.Count}.");
        }

        var accountId = currentUser.AccountId;
        var session = await db.GameSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == request.SessionId && s.AccountId == accountId, ct);
        if (session is null || session.Status != SessionStatus.Active)
        {
            return Error.Conflict("save.session_closed", "Only runs in progress can be saved.");
        }

        if (request.Actions.Any(a => a.T > request.Tick))
        {
            return Error.Validation("save.actions", "Actions cannot be later than the saved tick.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        var save = await db.SaveGames.SingleOrDefaultAsync(s => s.AccountId == accountId && s.Slot == slot, ct);
        if (save is null)
        {
            save = new SaveGame { AccountId = accountId, Slot = slot, ActionsJson = "[]", Summary = request.Summary };
            db.SaveGames.Add(save);
        }
        else if (request.ExpectedVersion is { } expected && expected != save.Version)
        {
            return Error.Conflict("save.version_conflict", "This slot was updated on another device.");
        }

        save.SessionId = request.SessionId;
        save.Tick = request.Tick;
        save.ActionsJson = JsonSerializer.Serialize(request.Actions, ContentJson.Options);
        save.Summary = request.Summary;
        save.UpdatedAt = now;
        audit.Record(AuditCategories.SaveGame, "save.written", new { slot, request.SessionId, request.Tick, Actions = request.Actions.Count });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Error.Conflict("save.version_conflict", "This slot was updated on another device.");
        }

        await live.SaveGameChanged(accountId, slot, save.Version);
        return new SaveGameSummary(save.Slot, save.SessionId, save.Tick, save.Summary, save.UpdatedAt, save.Version);
    }
}

public sealed class DeleteSaveGameHandler(AppDbContext db, ICurrentUser currentUser, LiveNotifier live) : IHandler
{
    public async Task<Result<Unit>> Handle(int slot, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var deleted = await db.SaveGames.Where(s => s.AccountId == accountId && s.Slot == slot).ExecuteDeleteAsync(ct);
        if (deleted > 0)
        {
            await live.SaveGameChanged(accountId, slot, 0);
        }

        return Unit.Value;
    }
}
