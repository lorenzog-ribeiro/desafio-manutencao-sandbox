using Microsoft.EntityFrameworkCore;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Infra.Data.Mappings;

namespace SoftwareTriage.Infra.Data.Context;

public sealed class TriageDbContext(DbContextOptions<TriageDbContext> options) : DbContext(options)
{
    public DbSet<TriageJob> TriageJobs => Set<TriageJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfiguration(new TriageJobConfiguration());
    }
}
