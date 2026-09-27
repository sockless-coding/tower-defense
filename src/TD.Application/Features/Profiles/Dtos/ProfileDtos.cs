using System.Text.Json;
using TD.Application.Features.Accounts;

namespace TD.Application.Features.Profiles;

public sealed record ProfileDto(
    Guid AccountId,
    string DisplayName,
    AccountKind Kind,
    int CommanderLevel,
    long CommanderXp,
    long Gears,
    long ResearchPoints,
    string SelectedBanner,
    string SelectedTitle,
    JsonElement Settings,
    long Version);

public sealed record UpdateProfileRequest(string DisplayName, long ExpectedVersion);

public sealed record UpdateSettingsRequest(JsonElement Settings);
