using Microsoft.EntityFrameworkCore;
using TD.Application.Features.Accounts;
using TD.Application.Features.Achievements;
using TD.Application.Features.Campaign;
using TD.Application.Features.Content;
using TD.Application.Features.Leaderboards;
using TD.Application.Features.Progression;
using TD.Application.Features.Research;
using TD.Application.Features.SaveGames;
using TD.Application.Features.Sessions;
using TD.Application.Features.Statistics;
using TD.Application.Features.Towers;
using TD.Application.Features.Profiles;
using TD.Application.Infrastructure.Audit;

namespace TD.Application.Infrastructure.Data;

/// <summary>
/// The single EF Core context. Feature slices query it directly (no repositories).
/// Provider-specific subclasses exist only so each provider keeps its own migrations.
/// </summary>
public abstract partial class AppDbContext(DbContextOptions options) : DbContext(options)
{
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PlayerProfile> Profiles => Set<PlayerProfile>();
    public DbSet<ContentDocument> ContentDocuments => Set<ContentDocument>();
    public DbSet<LevelProgress> LevelProgress => Set<LevelProgress>();
    public DbSet<ResearchUnlock> ResearchUnlocks => Set<ResearchUnlock>();
    public DbSet<TowerPrestigeRank> TowerPrestige => Set<TowerPrestigeRank>();
    public DbSet<AchievementUnlock> AchievementUnlocks => Set<AchievementUnlock>();
    public DbSet<CosmeticUnlock> CosmeticUnlocks => Set<CosmeticUnlock>();
    public DbSet<PlayerStatistic> Statistics => Set<PlayerStatistic>();
    public DbSet<GameSession> GameSessions => Set<GameSession>();
    public DbSet<LeaderboardEntry> LeaderboardEntries => Set<LeaderboardEntry>();
    public DbSet<SaveGame> SaveGames => Set<SaveGame>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => typeof(IVersioned).IsAssignableFrom(e.ClrType)))
        {
            modelBuilder.Entity(entity.ClrType).Property(nameof(IVersioned.Version)).IsConcurrencyToken();
        }
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<IVersioned>().Where(e => e.State == EntityState.Modified))
        {
            entry.Entity.Version++;
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}

public sealed class SqliteAppDbContext(DbContextOptions<SqliteAppDbContext> options) : AppDbContext(options);

public sealed class PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : AppDbContext(options);

/// <summary>Optimistic concurrency: the version is incremented on every update and checked on save.</summary>
public interface IVersioned
{
    long Version { get; set; }
}
