using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Statistics;

/// <summary>A server-maintained counter or maximum (e.g. "kills.total", "survival.bestWave") that drives achievements.</summary>
public sealed class PlayerStatistic
{
    public Guid AccountId { get; set; }
    public required string Key { get; set; }
    public long Value { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class PlayerStatisticConfiguration : IEntityTypeConfiguration<PlayerStatistic>
{
    public void Configure(EntityTypeBuilder<PlayerStatistic> builder)
    {
        builder.HasKey(s => new { s.AccountId, s.Key });
        builder.Property(s => s.Key).HasMaxLength(96);
    }
}
