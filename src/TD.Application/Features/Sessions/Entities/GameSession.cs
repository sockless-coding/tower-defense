using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TD.Application.Features.Campaign;

namespace TD.Application.Features.Sessions;

public enum SessionStatus
{
    Active,
    Completed,
    Rejected,
    Abandoned,
}

/// <summary>
/// A server-issued play session. The level, modifiers, bonuses and unlocks are frozen here at start so completion is
/// validated against exactly what the client was given, even if content or progression changes mid-run.
/// </summary>
public sealed class GameSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid AccountId { get; set; }
    public GameMode Mode { get; set; }
    public required string LevelId { get; set; }
    public string? EventKey { get; set; }
    public string? PresetId { get; set; }
    public uint Seed { get; set; }
    public double RewardMultiplier { get; set; }
    public required string ConfigJson { get; set; }
    public required string ContentVersion { get; set; }
    public SessionStatus Status { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? Outcome { get; set; }
    public long Score { get; set; }
    public int Stars { get; set; }
    public string? RejectionReason { get; set; }
    public string? ResultJson { get; set; }
}

public sealed class GameSessionConfiguration : IEntityTypeConfiguration<GameSession>
{
    public void Configure(EntityTypeBuilder<GameSession> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.LevelId).HasMaxLength(64);
        builder.Property(s => s.EventKey).HasMaxLength(64);
        builder.Property(s => s.PresetId).HasMaxLength(32);
        builder.Property(s => s.ContentVersion).HasMaxLength(32);
        builder.Property(s => s.Outcome).HasMaxLength(16);
        builder.Property(s => s.RejectionReason).HasMaxLength(256);
        builder.HasIndex(s => new { s.AccountId, s.Status });
        builder.HasIndex(s => new { s.AccountId, s.StartedAt });
    }
}
