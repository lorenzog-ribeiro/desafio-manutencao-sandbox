using SoftwareTriage.Core.Application.DTOs;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.Ports;

namespace SoftwareTriage.Core.Application.UseCases;

public sealed class GetTriageResultUseCase(ITriageJobRepository repository)
{
    public async Task<TriageResultDto?> ExecuteAsync(
        string repositoryName,
        int issueNumber,
        CancellationToken cancellationToken = default)
    {
        var job = await repository.GetByRepoAndNumberAsync(repositoryName, issueNumber, cancellationToken);
        return job is null ? null : MapToDto(job);
    }

    public async Task<IReadOnlyList<TriageResultDto>> ListRecentAsync(
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var jobs = await repository.ListRecentAsync(limit, cancellationToken);
        return jobs.Select(MapToDto).ToList();
    }

    private static TriageResultDto MapToDto(TriageJob job)
    {
        return new TriageResultDto(
            job.EventId,
            job.Repository,
            job.IssueNumber,
            job.Title,
            job.Status.ToString(),
            job.Proposal?.Category.ToString(),
            job.Proposal?.ProblemSummary,
            job.Proposal?.SuggestedAction,
            job.PublishedAt,
            job.FailureReason
        );
    }
}
