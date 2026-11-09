using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace SoftwareTriage.Infra.GitHub.Webhooks;

public sealed record GitHubWebhookPayload(
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("issue")] GitHubWebhookIssue? Issue,
    [property: JsonPropertyName("repository")] GitHubWebhookRepository? Repository,
    [property: JsonPropertyName("zen")] string? Zen
);

public sealed record GitHubWebhookIssue(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("number")] int Number,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("body")] string? Body,
    [property: JsonPropertyName("state")] string? State
);

public sealed record GitHubWebhookRepository(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("full_name")] string FullName
);

public static class GitHubWebhookSecurity
{
    public static bool VerifySignature(string payload, string? signatureWithPrefix, string? secret)
    {
        if (string.IsNullOrWhiteSpace(secret))
            return true; // Secret not enforced

        if (string.IsNullOrWhiteSpace(signatureWithPrefix) || !signatureWithPrefix.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase))
            return false;

        var signatureHex = signatureWithPrefix["sha256=".Length..];

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hashBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var computedHex = Convert.ToHexStringLower(hashBytes);

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(signatureHex.ToLowerInvariant()),
            Encoding.UTF8.GetBytes(computedHex)
        );
    }
}
