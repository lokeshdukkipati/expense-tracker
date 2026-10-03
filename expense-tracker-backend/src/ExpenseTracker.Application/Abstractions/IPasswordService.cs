namespace ExpenseTracker.Application.Abstractions;

public enum PasswordVerifyResult
{
    Failed = 0,
    Success = 1,
    SuccessRehashNeeded = 2
}

public interface IPasswordService
{
    string Hash(string password);

    PasswordVerifyResult Verify(string passwordHash, string password);
}
