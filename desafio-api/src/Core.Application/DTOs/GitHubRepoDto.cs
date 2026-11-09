namespace SoftwareTriage.Core.Application.DTOs;

public sealed record GitHubRepoDto(
    long Id,
    string Name,
    string FullName,
    string Owner,
    string? HtmlUrl,
    string? Description,
    int OpenIssuesCount,
    bool IsPrivate
);
