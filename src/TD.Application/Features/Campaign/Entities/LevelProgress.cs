using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Campaign;

/// <summary>A player's best result on one level (campaign or challenge). Written only by validated session completions.</summary>
public sealed class LevelProgress
{
    public Guid AccountId { get; set; }
    public required string LevelId { get; set; }
    public int BestStars { get; set; }
    public long BestScore { get; set; }
    public int Completions { get; set; }
    public int PerfectCompletions { get; set; }
    public DateTime FirstCompletedAt { get; set; }
    public DateTime LastCompletedAt { get; set; }
}

public sealed class LevelProgressConfiguration : IEntityTypeConfiguration<LevelProgress>
{
    public void Configure(EntityTypeBuilder<LevelProgress> builder)
    {
        builder.HasKey(p => new { p.AccountId, p.LevelId });
        builder.Property(p => p.LevelId).HasMaxLength(64);
    }
}
