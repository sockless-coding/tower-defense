using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Towers;

/// <summary>Permanent per-tower prestige bought with gears; each rank applies the tower's prestige mods once.</summary>
public sealed class TowerPrestigeRank
{
    public Guid AccountId { get; set; }
    public required string TowerId { get; set; }
    public int Rank { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class TowerPrestigeRankConfiguration : IEntityTypeConfiguration<TowerPrestigeRank>
{
    public void Configure(EntityTypeBuilder<TowerPrestigeRank> builder)
    {
        builder.HasKey(r => new { r.AccountId, r.TowerId });
        builder.Property(r => r.TowerId).HasMaxLength(64);
    }
}
