using FluentValidation;
using TD.Application.Features.Sessions;

namespace TD.Application.Features.SaveGames;

public sealed class PutSaveGameRequestValidator : AbstractValidator<PutSaveGameRequest>
{
    public PutSaveGameRequestValidator()
    {
        RuleFor(r => r.SessionId).NotEmpty();
        RuleFor(r => r.Tick).GreaterThanOrEqualTo(0);
        RuleFor(r => r.Actions).NotNull().Must(a => a.Count <= RunValidator.MaxActions);
        RuleFor(r => r.Summary).NotEmpty().MaximumLength(256);
        RuleForEach(r => r.Actions).Must(a => a.T >= 0).WithMessage("Actions must have non-negative ticks.");
    }
}
