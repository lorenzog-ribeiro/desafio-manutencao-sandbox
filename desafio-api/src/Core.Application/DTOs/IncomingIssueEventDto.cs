namespace SoftwareTriage.Core.Application.DTOs;

public sealed record IncomingIssueEventDto(
    string EventId,
    string Repository,
    int IssueNumber,
    string Title,
    string Description
);
