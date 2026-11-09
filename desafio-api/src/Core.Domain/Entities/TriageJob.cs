using SoftwareTriage.Core.Domain.Common;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Domain.Entities;

public sealed class TriageJob : Entity<TriageJobId>
{
    public string EventId { get; private set; } = string.Empty;
    public string Repository { get; private set; } = string.Empty;
    public int IssueNumber { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public TriageStatus Status { get; private set; }
    public TriageProposal? Proposal { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? PublishedAt { get; private set; }
    public string? FailureReason { get; private set; }

    // Private constructor for EF Core or internal factories
    private TriageJob() { }

    private TriageJob(
        TriageJobId id,
        string eventId,
        string repository,
        int issueNumber,
        string title,
        string description,
        TriageStatus status,
        string? failureReason = null)
        : base(id)
    {
        EventId = string.IsNullOrWhiteSpace(eventId) ? throw new ArgumentException("EventId cannot be empty", nameof(eventId)) : eventId;
        Repository = string.IsNullOrWhiteSpace(repository) ? throw new ArgumentException("Repository cannot be empty", nameof(repository)) : repository;
        IssueNumber = issueNumber <= 0 ? throw new ArgumentOutOfRangeException(nameof(issueNumber), "Issue number must be positive") : issueNumber;
        Title = title ?? string.Empty;
        Description = description ?? string.Empty;
        Status = status;
        FailureReason = failureReason;
        CreatedAt = DateTime.UtcNow;
    }

    public static TriageJob CreateAccepted(
        string eventId,
        string repository,
        int issueNumber,
        string title,
        string description)
    {
        return new TriageJob(
            TriageJobId.New(),
            eventId,
            repository,
            issueNumber,
            title,
            description,
            TriageStatus.Accepted
        );
    }

    public static TriageJob CreateRejectedForHumanReview(
        string eventId,
        string repository,
        int issueNumber,
        string title,
        string description,
        string reason)
    {
        return new TriageJob(
            TriageJobId.New(),
            eventId,
            repository,
            issueNumber,
            title,
            description,
            TriageStatus.HumanReviewRequired,
            reason
        );
    }

    public void StartProcessing()
    {
        if (Status == TriageStatus.Published)
        {
            throw new InvalidOperationException("Cannot process a job that is already published.");
        }

        Status = TriageStatus.Processing;
    }

    public void Publish(TriageProposal proposal, DateTime publishedAt)
    {
        ArgumentNullException.ThrowIfNull(proposal);

        Proposal = proposal;
        PublishedAt = publishedAt;
        Status = TriageStatus.Published;
        FailureReason = null;
    }

    public void RequireHumanReview(string reason, TriageProposal? proposal = null, DateTime? publishedAt = null)
    {
        Status = TriageStatus.HumanReviewRequired;
        FailureReason = string.IsNullOrWhiteSpace(reason) ? "Manual intervention requested." : reason;
        if (proposal is not null)
        {
            Proposal = proposal;
        }
        if (publishedAt is not null)
        {
            PublishedAt = publishedAt;
        }
    }
}
