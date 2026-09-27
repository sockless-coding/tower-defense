namespace TD.Application.Features.Maps;

/// <summary>Grid connectivity checks shared by content validation and server-side placement validation.</summary>
public static class MapPathing
{
    private static readonly (int Dx, int Dy)[] Neighbours = [(1, 0), (-1, 0), (0, 1), (0, -1)];

    /// <summary>
    /// True when every spawn can reach the core and the core can reach at least one exit, treating
    /// <paramref name="blocked"/> cells (e.g. towers on floor tiles) as impassable. Gates count as open.
    /// </summary>
    public static bool RoutesIntact(MapDefinition map, IReadOnlySet<(int X, int Y)> blocked)
    {
        var core = map.Cells(MapLegend.Core).Single();
        var reachable = Flood(map, core, blocked);
        var spawns = map.Cells(MapLegend.Spawn).ToList();
        return spawns.All(reachable.Contains)
            && spawns.Concat(map.Cells(MapLegend.Exit)).Any(reachable.Contains);
    }

    public static HashSet<(int X, int Y)> Flood(MapDefinition map, (int X, int Y) start, IReadOnlySet<(int X, int Y)> blocked, Func<char, bool>? walkable = null)
    {
        walkable ??= MapLegend.IsWalkable;
        var seen = new HashSet<(int X, int Y)> { start };
        var queue = new Queue<(int X, int Y)>();
        queue.Enqueue(start);

        while (queue.Count > 0)
        {
            var (x, y) = queue.Dequeue();
            foreach (var (dx, dy) in Neighbours)
            {
                var next = (X: x + dx, Y: y + dy);
                if (next.X < 0 || next.Y < 0 || next.X >= map.Width || next.Y >= map.Height)
                {
                    continue;
                }

                if (seen.Contains(next) || blocked.Contains(next) || !walkable(map.At(next.X, next.Y)))
                {
                    continue;
                }

                seen.Add(next);
                queue.Enqueue(next);
            }
        }

        return seen;
    }
}
