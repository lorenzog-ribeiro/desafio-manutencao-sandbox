using Microsoft.EntityFrameworkCore;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;
using SoftwareTriage.Infra.Data.Context;

namespace SoftwareTriage.Infra.Data.Repositories;

public sealed class EfTriageJobRepository(TriageDbContext context) : ITriageJobRepository
{
    public async Task<TriageJob?> GetByEventIdAsync(string eventId, CancellationToken cancellationToken = default)
    {
        return await context.TriageJobs
            .AsNoTracking()
            .FirstOrDefaultAsync(j => j.EventId == eventId, cancellationToken);
    }

    public async Task<TriageJob?> GetByRepoAndNumberAsync(
        string repository,
        int issueNumber,
        CancellationToken cancellationToken = default)
    {
        return await context.TriageJobs
            .AsNoTracking()
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefaultAsync(j => j.Repository == repository && j.IssueNumber == issueNumber, cancellationToken);
    }

    public async Task<TriageJob?> GetByIdAsync(TriageJobId id, CancellationToken cancellationToken = default)
    {
        return await context.TriageJobs
            .FirstOrDefaultAsync(j => j.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<TriageJob>> GetPendingJobsAsync(CancellationToken cancellationToken = default)
    {
        return await context.TriageJobs
            .Where(j => j.Status == TriageStatus.Accepted)
            .OrderBy(j => j.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TriageJob>> ListRecentAsync(int limit = 50, CancellationToken cancellationToken = default)
    {
        return await context.TriageJobs
            .AsNoTracking()
            .OrderByDescending(j => j.CreatedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    public async Task SaveAsync(TriageJob job, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(job);

        var entry = context.Entry(job);
        if (entry.State == EntityState.Detached)
        {
            var existing = await context.TriageJobs.FindAsync([job.Id], cancellationToken);
            if (existing is null)
            {
                await context.TriageJobs.AddAsync(job, cancellationToken);
            }
            else
            {
                context.Entry(existing).CurrentValues.SetValues(job);
            }
        }

        await context.SaveChangesAsync(cancellationToken);
    }
}
