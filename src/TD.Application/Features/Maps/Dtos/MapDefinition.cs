namespace TD.Application.Features.Maps;

/// <summary>
/// Grid legend (one character per cell):
/// <list type="bullet">
/// <item><c>.</c> floor: walkable and buildable, so towers placed here reroute enemies</item>
/// <item><c>=</c> road: walkable, not buildable</item>
/// <item><c>B</c> build platform: buildable, not walkable</item>
/// <item><c>#</c> scenery: blocked</item>
/// <item><c>S</c> spawn (also an exit), <c>E</c> exit only, <c>C</c> core vault</item>
/// <item><c>G</c> gate: walkable while open; toggled by the map mechanic or interaction</item>
/// <item><c>~</c> special terrain driven by the map mechanic (water, conveyor, ice, vents, ...)</item>
/// </list>
/// </summary>
public static class MapLegend
{
    public const char Floor = '.';
    public const char Road = '=';
    public const char Platform = 'B';
    public const char Blocked = '#';
    public const char Spawn = 'S';
    public const char Exit = 'E';
    public const char Core = 'C';
    public const char Gate = 'G';
    public const char Special = '~';

    public static bool IsBuildable(char c) => c is Floor or Platform;
    public static bool IsWalkable(char c) => c is Floor or Road or Spawn or Exit or Core or Gate or Special;
}

public sealed record MapPalette(string Ground, string Accent, string Metal, string Light, string Fog, string Sky);

/// <summary>
/// Map-driven rule. Kinds implemented by the simulation: floodgates, conveyor, magneticPulse, freezing, steamVents,
/// drawbridge, lightningRods, darkness, crumblingFloor, pressureValves, rotatingTurntable, emberRain, tides,
/// aetherSurge, smog, trainCrossing.
/// </summary>
public sealed record MapMechanic(string Kind, string Name, string Description, IReadOnlyDictionary<string, double> Params);

/// <summary>A player-triggered environmental interaction with a cooldown (e.g. vent a boiler onto the road).</summary>
public sealed record MapInteraction(string Kind, string Name, string Description, double Cooldown, IReadOnlyDictionary<string, double> Params);

public sealed record MapDefinition(
    string Id,
    string Name,
    string Theme,
    string Description,
    string Weather,
    MapPalette Palette,
    MapMechanic Mechanic,
    MapInteraction Interaction,
    IReadOnlyList<string> Grid)
{
    public int Width => Grid[0].Length;
    public int Height => Grid.Count;

    public char At(int x, int y) => Grid[y][x];

    public IEnumerable<(int X, int Y)> Cells(char c)
    {
        for (var y = 0; y < Height; y++)
        {
            for (var x = 0; x < Width; x++)
            {
                if (Grid[y][x] == c)
                {
                    yield return (x, y);
                }
            }
        }
    }
}
