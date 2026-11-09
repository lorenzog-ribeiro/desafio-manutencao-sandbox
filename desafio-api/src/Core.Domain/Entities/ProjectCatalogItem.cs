using SoftwareTriage.Core.Domain.Common;

namespace SoftwareTriage.Core.Domain.Entities;

public sealed class ProjectCatalogItem : Entity<string>
{
    public string Repository => Id;
    public string Maintainer { get; private set; } = string.Empty;
    public string TriageGuidelines { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }

    public ProjectCatalogItem(string repository, string maintainer, string triageGuidelines, bool isActive = true)
        : base(repository)
    {
        Maintainer = maintainer;
        TriageGuidelines = triageGuidelines;
        IsActive = isActive;
    }

    private ProjectCatalogItem() { }
}
