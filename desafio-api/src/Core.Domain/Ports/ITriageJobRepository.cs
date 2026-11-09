using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Domain.Ports;

public interface ITriageJobRepository
{
    Task<TriageJob?> GetByEventIdAsync(string eventId, CancellationToken cancellationToken = default);
    Task<TriageJob?> GetByRepoAndNumberAsync(string repository, int issueNumber, CancellationToken cancellationToken = default);
    Task<TriageJob?> GetByIdAsync(TriageJobId id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TriageJob>> GetPendingJobsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<TriageJob>> ListRecentAsync(int limit = 50, CancellationToken cancellationToken = default);
    Task SaveAsync(TriageJob job, CancellationToken cancellationToken = default);
}
