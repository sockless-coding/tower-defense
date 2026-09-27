using TD.Application.Features.Waves;

namespace TD.Application.Tests.Features;

/// <summary>The client simulation uses the same generator; these reference values are asserted on both sides.</summary>
public sealed class SeededRandomTests
{
    [Fact]
    public void Mulberry32_matches_reference_sequence()
    {
        var rng = new SeededRandom(12345);
        Assert.Equal([4207900869u, 1317490944u, 2079646450u, 3513001552u, 2187978186u], Enumerable.Range(0, 5).Select(_ => rng.NextUInt()));
    }

    [Fact]
    public void Fnv1a_matches_reference() => Assert.Equal(2835741409u, SeededRandom.Hash("campaign-001"));
}
