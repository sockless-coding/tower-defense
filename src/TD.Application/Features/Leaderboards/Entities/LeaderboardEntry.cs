using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Leaderboards;

/// <summary>A player's best validated score on one board (e.g. "level:campaign-012", "daily:2026-09-27").</summary>
public sealed class LeaderboardEntry
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string BoardKey { get; set; }
    public Guid AccountId { get; set; }
    public required string DisplayName { get; set; }
    public long Score { get; set; }
    public int Waves { get; set; }
    public int Stars { get; set; }
    public Guid SessionId { get; set; }
    public DateTime AchievedAt { get; set; }
}

public sealed class LeaderboardEntryConfiguration : IEntityTypeConfiguration<LeaderboardEntry>
{
    public void Configure(EntityTypeBuilder<LeaderboardEntry> builder)
    {
        builder.HasKey(e => e.Id);
        builder.Property(e => e.BoardKey).HasMaxLength(96);
        builder.Property(e => e.DisplayName).HasMaxLength(32);
        builder.HasIndex(e => new { e.BoardKey, e.AccountId }).IsUnique();
        builder.HasIndex(e => new { e.BoardKey, e.Score });
    }
}
