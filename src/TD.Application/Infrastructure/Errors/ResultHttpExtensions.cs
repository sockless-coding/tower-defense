namespace TD.Application.Infrastructure.Errors;

public static class ResultHttpExtensions
{
    public static IResult ToHttpResult<T>(this Result<T> result) =>
        result.IsSuccess ? TypedResults.Ok(result.Value) : result.Error!.ToProblem();

    public static IResult ToHttpResult<T>(this Result<T> result, Func<T, IResult> onSuccess) =>
        result.IsSuccess ? onSuccess(result.Value) : result.Error!.ToProblem();

    public static IResult ToProblem(this Error error)
    {
        var (status, title) = error.Type switch
        {
            ErrorType.Validation => (StatusCodes.Status400BadRequest, "Validation failed"),
            ErrorType.NotFound => (StatusCodes.Status404NotFound, "Not found"),
            ErrorType.Conflict => (StatusCodes.Status409Conflict, "Conflict"),
            ErrorType.Unauthorized => (StatusCodes.Status401Unauthorized, "Unauthorized"),
            ErrorType.Forbidden => (StatusCodes.Status403Forbidden, "Forbidden"),
            // Deliberately vague: never tell a cheater which check tripped.
            ErrorType.Cheat => (StatusCodes.Status422UnprocessableEntity, "Submission rejected"),
            _ => (StatusCodes.Status500InternalServerError, "Error"),
        };

        var detail = error.Type == ErrorType.Cheat ? "The submitted result could not be verified." : error.Message;
        var code = error.Type == ErrorType.Cheat ? "session.rejected" : error.Code;

        return TypedResults.Problem(
            statusCode: status,
            title: title,
            detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code });
    }
}
