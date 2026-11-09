using SoftwareTriage.Core.Domain.Entities;

namespace SoftwareTriage.Core.Domain.Ports;

public interface IProjectCatalog
{
    Task<bool> IsAcceptedAsync(string repository, CancellationToken cancellationToken = default);
    Task<ProjectCatalogItem?> GetCatalogItemAsync(string repository, CancellationToken cancellationToken = default);
}
