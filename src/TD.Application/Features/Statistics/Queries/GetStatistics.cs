using Microsoft.EntityFrameworkCore;
using TD.Application.Infrastructure.Auth;
using TD.Application.Infrastructure.Data;
using TD.Application.Infrastructure.Endpoints;

namespace TD.Application.Features.Statistics;

public sealed class GetStatisticsHandler(AppDbContext db, ICurrentUser currentUser) : IHandler
{
    public async Task<IReadOnlyDictionary<string, long>> Handle(CancellationToken ct)
    {
        var accountId = currentUser.AccountId;
        return await db.Statistics.AsNoTracking()
            .Where(s => s.AccountId == accountId)
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
    }
}
