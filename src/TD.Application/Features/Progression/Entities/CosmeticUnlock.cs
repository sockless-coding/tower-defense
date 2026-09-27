using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Progression;

public sealed class CosmeticUnlock
{
    public Guid AccountId { get; set; }
    public required string CosmeticId { get; set; }
    public required string Source { get; set; }
    public DateTime UnlockedAt { get; set; }
}

public sealed class CosmeticUnlockConfiguration : IEntityTypeConfiguration<CosmeticUnlock>
{
    public void Configure(EntityTypeBuilder<CosmeticUnlock> builder)
    {
        builder.HasKey(c => new { c.AccountId, c.CosmeticId });
        builder.Property(c => c.CosmeticId).HasMaxLength(64);
        builder.Property(c => c.Source).HasMaxLength(64);
    }
}
