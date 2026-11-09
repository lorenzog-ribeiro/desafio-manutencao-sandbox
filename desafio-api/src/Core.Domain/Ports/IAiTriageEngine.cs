using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Domain.Ports;

public interface IAiTriageEngine
{
    Task<TriageProposal> AnalyzeAsync(
        string title,
        string description,
        string? guidelines = null,
        CancellationToken cancellationToken = default);
}
