using FluentValidation;

namespace TD.Application.Features.Sessions;

public sealed class StartSessionRequestValidator : AbstractValidator<StartSessionRequest>
{
    public StartSessionRequestValidator()
    {
        RuleFor(r => r.Mode).IsInEnum();
        RuleFor(r => r.LevelId).MaximumLength(64);
        RuleFor(r => r.MapId).MaximumLength(64);
        RuleFor(r => r.PresetId).MaximumLength(32);
    }
}

public sealed class CompleteSessionRequestValidator : AbstractValidator<CompleteSessionRequest>
{
    public CompleteSessionRequestValidator()
    {
        RuleFor(r => r.Actions).NotNull().Must(a => a.Count <= RunValidator.MaxActions);
        RuleFor(r => r.Result).NotNull();
        RuleFor(r => r.Result.Stats).NotNull().When(r => r.Result is not null);
        RuleFor(r => r.Result.Stats.Kills).Must(k => k.Count <= 64).When(r => r.Result?.Stats is not null);
        RuleForEach(r => r.Actions).ChildRules(a =>
        {
            a.RuleFor(x => x.Type).NotEmpty().MaximumLength(16);
            a.RuleFor(x => x.Tower).MaximumLength(64);
            a.RuleFor(x => x.Upgrade).MaximumLength(80);
            a.RuleFor(x => x.Mode).MaximumLength(16);
        });
    }
}
