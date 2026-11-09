using Microsoft.Extensions.Logging;
using SoftwareTriage.Core.Application.DTOs;
using SoftwareTriage.Core.Application.Ports;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Application.UseCases;

public sealed class ReceiveEventUseCase(
    IProjectCatalog catalog,
    ITriageJobRepository repository,
    ITriageJobQueue queue,
    ILogger<ReceiveEventUseCase> logger)
{
    public async Task<TriageResultDto> ExecuteAsync(
        IncomingIssueEventDto dto,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dto);

        // 1. Idempotency check by EventId
        var existingJob = await repository.GetByEventIdAsync(dto.EventId, cancellationToken);
        if (existingJob is not null)
        {
            logger.LogInformation("Event '{EventId}' was already processed. Current status: {Status}", dto.EventId, existingJob.Status);
            return MapToDto(existingJob);
        }

        // 2. Validate repository catalog inclusion
        var isAccepted = await catalog.IsAcceptedAsync(dto.Repository, cancellationToken);
        if (!isAccepted)
        {
            logger.LogWarning("Repository '{Repository}' rejected - not found in catalog. Routing to Human Review.", dto.Repository);
            
            var uncatalogedJob = TriageJob.CreateRejectedForHumanReview(
                dto.EventId,
                dto.Repository,
                dto.IssueNumber,
                dto.Title,
                dto.Description,
                $"Repository '{dto.Repository}' is not present in the accepted project catalog."
            );

            await repository.SaveAsync(uncatalogedJob, cancellationToken);
            return MapToDto(uncatalogedJob);
        }

        // 3. Create Accepted Job and enqueue for processing
        var acceptedJob = TriageJob.CreateAccepted(
            dto.EventId,
            dto.Repository,
            dto.IssueNumber,
            dto.Title,
            dto.Description
        );

        await repository.SaveAsync(acceptedJob, cancellationToken);
        await queue.EnqueueAsync(acceptedJob.Id, cancellationToken);

        logger.LogInformation("Job '{JobId}' accepted for issue #{IssueNumber} in '{Repository}' and queued.",
            acceptedJob.Id, acceptedJob.IssueNumber, acceptedJob.Repository);

        return MapToDto(acceptedJob);
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
