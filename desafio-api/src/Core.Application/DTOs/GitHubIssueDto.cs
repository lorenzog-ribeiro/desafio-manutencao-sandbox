namespace SoftwareTriage.Core.Application.DTOs;

public sealed record GitHubIssueDto(
    long Id,
    int Number,
    string Title,
    string? Body,
    string State,
    string? HtmlUrl,
    string? Author,
    DateTime CreatedAt
);
