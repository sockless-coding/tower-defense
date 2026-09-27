using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TD.Application.Infrastructure.Data;

namespace TD.Application.Features.SaveGames;

/// <summary>
/// A cloud save of an in-progress run. Because the simulation is deterministic, a save is just the session plus the
/// action log and tick reached: resuming replays the log to that tick on any device.
/// </summary>
public sealed class SaveGame : IVersioned
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid AccountId { get; set; }
    public int Slot { get; set; }
    public Guid SessionId { get; set; }
    public int Tick { get; set; }
    public required string ActionsJson { get; set; }
    public required string Summary { get; set; }
    public DateTime UpdatedAt { get; set; }
    public long Version { get; set; }
}

public sealed class SaveGameConfiguration : IEntityTypeConfiguration<SaveGame>
{
    public void Configure(EntityTypeBuilder<SaveGame> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Summary).HasMaxLength(256);
        builder.HasIndex(s => new { s.AccountId, s.Slot }).IsUnique();
    }
}
