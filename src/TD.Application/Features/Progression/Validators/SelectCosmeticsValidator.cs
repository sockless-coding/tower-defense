using FluentValidation;

namespace TD.Application.Features.Progression;

public sealed class SelectCosmeticsRequestValidator : AbstractValidator<SelectCosmeticsRequest>
{
    public SelectCosmeticsRequestValidator()
    {
        RuleFor(r => r.Banner).NotEmpty().MaximumLength(64);
        RuleFor(r => r.Title).NotEmpty().MaximumLength(64);
    }
}
