namespace SoftwareTriage.Core.Domain.ValueObjects;

public sealed record TriageProposal(
    IssueCategory Category,
    string ProblemSummary,
    string SuggestedAction
);
