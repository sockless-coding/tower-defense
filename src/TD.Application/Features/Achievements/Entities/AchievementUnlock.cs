using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TD.Application.Features.Achievements;

public sealed class AchievementUnlock
{
    public Guid AccountId { get; set; }
    public required string AchievementId { get; set; }
    public DateTime UnlockedAt { get; set; }
}

public sealed class AchievementUnlockConfiguration : IEntityTypeConfiguration<AchievementUnlock>
{
    public void Configure(EntityTypeBuilder<AchievementUnlock> builder)
    {
        builder.HasKey(a => new { a.AccountId, a.AchievementId });
        builder.Property(a => a.AchievementId).HasMaxLength(64);
    }
}
