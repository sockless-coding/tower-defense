using TD.Application.Features.Sessions;

namespace TD.Application.Features.SaveGames;

public sealed record SaveGameSummary(int Slot, Guid SessionId, int Tick, string Summary, DateTime UpdatedAt, long Version);

public sealed record SaveGameDetails(int Slot, Guid SessionId, int Tick, IReadOnlyList<ActionDto> Actions, string Summary, DateTime UpdatedAt, long Version);

/// <param name="ExpectedVersion">Optimistic concurrency: the version the device last saw, or null for a new slot.</param>
public sealed record PutSaveGameRequest(Guid SessionId, int Tick, IReadOnlyList<ActionDto> Actions, string Summary, long? ExpectedVersion);
