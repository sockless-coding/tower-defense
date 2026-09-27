using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Content;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;
using TD.Application.Infrastructure.Errors;

namespace TD.Application.Features.Sessions;

/// <summary>Player quit mid-run: the session closes without rewards.</summary>
public sealed class AbandonSessionHandler(AppDbContext db, ICurrentUser currentUser, TimeProvider clock) : IHandler
{
    public async Task<Result<Unit>> Handle(Guid sessionId, CancellationToken ct)
    {
        var session = await db.GameSessions.SingleOrDefaultAsync(s => s.Id == sessionId && s.AccountId == currentUser.AccountId, ct);
        if (session is null)
        {
            return Error.NotFound("session.not_found", "Session not found.");
        }

        if (session.Status == SessionStatus.Active)
        {
            session.Status = SessionStatus.Abandoned;
            session.CompletedAt = clock.GetUtcNow().UtcDateTime;
            await db.SaveChangesAsync(ct);
        }

        return Unit.Value;
    }
}

/// <summary>Returns a session's frozen config so a saved run can be rebuilt and replayed on any device.</summary>
public sealed class GetSessionHandler(AppDbContext db, ICurrentUser currentUser, SessionTokens tokens) : IHandler
{
    public async Task<Result<SessionStartResponse>> Handle(Guid sessionId, CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        var session = await db.GameSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == sessionId && s.AccountId == accountId, ct);
        if (session is null)
        {
            return Error.NotFound("session.not_found", "Session not found.");
        }

        if (session.Status != SessionStatus.Active)
        {
            return Error.Conflict("session.closed", "This session has already ended.");
        }

        var config = JsonSerializer.Deserialize<SessionConfig>(session.ConfigJson, ContentJson.Options)!;
        return new SessionStartResponse(session.Id, tokens.Sign(session.Id, accountId, session.Seed), config, session.ContentVersion);
    }
}
