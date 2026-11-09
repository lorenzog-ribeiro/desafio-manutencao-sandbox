using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Infra.Data.Mappings;

public sealed class TriageJobConfiguration : IEntityTypeConfiguration<TriageJob>
{
    public void Configure(EntityTypeBuilder<TriageJob> builder)
    {
        builder.ToTable("triage_jobs");

        builder.HasKey(j => j.Id);

        builder.Property(j => j.Id)
            .HasConversion(
                id => id.Value,
                guid => new TriageJobId(guid))
            .IsRequired();

        builder.Property(j => j.EventId)
            .HasMaxLength(200)
            .IsRequired();

        // Idempotency: Unique constraint on EventId
        builder.HasIndex(j => j.EventId)
            .IsUnique();

        builder.Property(j => j.Repository)
            .HasMaxLength(250)
            .IsRequired();

        builder.Property(j => j.IssueNumber)
            .IsRequired();

        // Query optimization: Composite index on Repository + IssueNumber
        builder.HasIndex(j => new { j.Repository, j.IssueNumber });

        builder.Property(j => j.Title)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(j => j.Description)
            .HasColumnType("text");

        builder.Property(j => j.Status)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(j => j.CreatedAt)
            .IsRequired();

        builder.Property(j => j.PublishedAt);

        builder.Property(j => j.FailureReason)
            .HasMaxLength(1000);

        builder.OwnsOne(j => j.Proposal, proposal =>
        {
            proposal.Property(p => p.Category)
                .HasConversion<string>()
                .HasMaxLength(50)
                .HasColumnName("proposal_category");

            proposal.Property(p => p.ProblemSummary)
                .HasColumnType("text")
                .HasColumnName("proposal_problem_summary");

            proposal.Property(p => p.SuggestedAction)
                .HasColumnType("text")
                .HasColumnName("proposal_suggested_action");
        });
    }
}
