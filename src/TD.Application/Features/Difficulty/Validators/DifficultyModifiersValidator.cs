using FluentValidation;

namespace TD.Application.Features.Difficulty;

/// <summary>Structural validation only; range checks come from content via <see cref="DifficultyMath.Validate"/>.</summary>
public sealed class DifficultyModifiersValidator : AbstractValidator<DifficultyModifiers>
{
    public DifficultyModifiersValidator()
    {
        RuleFor(m => m.EnemySpeed).Must(double.IsFinite);
        RuleFor(m => m.EnemyHealth).Must(double.IsFinite);
        RuleFor(m => m.EnemyArmor).Must(double.IsFinite);
        RuleFor(m => m.TowerCost).Must(double.IsFinite);
        RuleFor(m => m.TowerDamage).Must(double.IsFinite);
        RuleFor(m => m.Economy).Must(double.IsFinite);
        RuleFor(m => m.Fog).Must(double.IsFinite);
        RuleFor(m => m.EliteChance).Must(double.IsFinite);
        RuleFor(m => m.BossFrequency).Must(double.IsFinite);
    }
}
