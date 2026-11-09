using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Application.Ports;

public interface ITriageJobQueue
{
    ValueTask EnqueueAsync(TriageJobId jobId, CancellationToken cancellationToken = default);
    IAsyncEnumerable<TriageJobId> DequeueAllAsync(CancellationToken cancellationToken = default);
}
