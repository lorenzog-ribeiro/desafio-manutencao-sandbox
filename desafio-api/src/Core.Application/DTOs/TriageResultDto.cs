namespace SoftwareTriage.Core.Application.DTOs;

public sealed record TriageResultDto(
    string EventId,
    string Repository,
    int IssueNumber,
    string Title,
    string Status,
    string? Category,
    string? ProblemSummary,
    string? SuggestedAction,
    DateTime? PublishedAt,
    string? FailureReason
);
