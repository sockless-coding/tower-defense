namespace TD.Application.Features.Waves;

/// <summary>
/// Mulberry32: a tiny, fast, portable PRNG. Used instead of <see cref="Random"/> so generated content is stable
/// across .NET versions, and so the TypeScript client can reproduce the same sequence from the same seed.
/// </summary>
public sealed class SeededRandom(uint seed)
{
    private uint _state = seed;

    public static uint Hash(string text)
    {
        // FNV-1a, 32-bit.
        var hash = 2166136261u;
        foreach (var c in text)
        {
            hash ^= c;
            hash *= 16777619u;
        }

        return hash;
    }

    public uint NextUInt()
    {
        _state += 0x6D2B79F5u;
        var t = _state;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + ((t ^ (t >> 7)) * (t | 61u));
        return t ^ (t >> 14);
    }

    public double NextDouble() => NextUInt() / 4294967296.0;

    public int Next(int maxExclusive) => maxExclusive <= 0 ? 0 : (int)(NextDouble() * maxExclusive);

    public double Range(double min, double max) => min + (max - min) * NextDouble();

    public T Pick<T>(IReadOnlyList<T> items, Func<T, double> weight)
    {
        var total = items.Sum(weight);
        var roll = NextDouble() * total;
        foreach (var item in items)
        {
            roll -= weight(item);
            if (roll <= 0)
            {
                return item;
            }
        }

        return items[^1];
    }
}
