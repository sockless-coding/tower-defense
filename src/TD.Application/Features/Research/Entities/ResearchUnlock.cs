using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Research;

public sealed class ResearchUnlock
{
    public Guid AccountId { get; set; }
    public required string NodeId { get; set; }
    public int Cost { get; set; }
    public DateTime PurchasedAt { get; set; }
}

public sealed class ResearchUnlockConfiguration : IEntityTypeConfiguration<ResearchUnlock>
{
    public void Configure(EntityTypeBuilder<ResearchUnlock> builder)
    {
        builder.HasKey(r => new { r.AccountId, r.NodeId });
        builder.Property(r => r.NodeId).HasMaxLength(64);
    }
}
