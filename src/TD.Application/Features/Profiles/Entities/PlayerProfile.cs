using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TD.Application.Features.Accounts;
using TD.Application.Infrastructure.Data;

namespace TD.Application.Features.Profiles;

/// <summary>
/// The player's authoritative progression state. One per account; the primary key is the account id.
/// Currency, XP and levels are only ever changed by server-side handlers.
/// </summary>
public sealed class PlayerProfile : IVersioned
{
    public Guid AccountId { get; set; }
    public required string DisplayName { get; set; }

    public int CommanderLevel { get; set; } = 1;
    public long CommanderXp { get; set; }

    /// <summary>Soft currency earned from levels; spent on tower prestige and cosmetics.</summary>
    public long Gears { get; set; }

    /// <summary>Spent in the research tree.</summary>
    public long ResearchPoints { get; set; }

    public string SelectedBanner { get; set; } = "banner.brass";
    public string SelectedTitle { get; set; } = "title.recruit";

    /// <summary>Client preferences (audio, graphics, controls) synced across devices. Not progression.</summary>
    public string SettingsJson { get; set; } = "{}";

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public long Version { get; set; }
}

public sealed class PlayerProfileConfiguration : IEntityTypeConfiguration<PlayerProfile>
{
    public void Configure(EntityTypeBuilder<PlayerProfile> builder)
    {
        builder.HasKey(p => p.AccountId);
        builder.Property(p => p.DisplayName).HasMaxLength(32);
        builder.Property(p => p.SelectedBanner).HasMaxLength(64);
        builder.Property(p => p.SelectedTitle).HasMaxLength(64);
        builder.Property(p => p.SettingsJson).HasMaxLength(8192);
        builder.HasOne<Account>().WithOne().HasForeignKey<PlayerProfile>(p => p.AccountId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(p => p.CommanderXp);
    }
}
