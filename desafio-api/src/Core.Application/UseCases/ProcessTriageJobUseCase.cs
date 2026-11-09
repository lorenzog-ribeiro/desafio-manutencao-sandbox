using Microsoft.Extensions.Logging;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Application.UseCases;

public sealed class ProcessTriageJobUseCase(
    ITriageJobRepository repository,
    IProjectCatalog catalog,
    IAiTriageEngine aiEngine,
    IIssuePublisher publisher,
    ILogger<ProcessTriageJobUseCase> logger)
{
    public async Task ExecuteAsync(TriageJobId jobId, CancellationToken cancellationToken = default)
    {
        var job = await repository.GetByIdAsync(jobId, cancellationToken);
        if (job is null)
        {
            logger.LogWarning("Triage job '{JobId}' not found.", jobId);
            return;
        }

        // Idempotency check: Do not re-process already published jobs
        if (job.Status == TriageStatus.Published)
        {
            logger.LogInformation("Triage job '{JobId}' is already published. Skipping.", jobId);
            return;
        }

        try
        {
            job.StartProcessing();
            await repository.SaveAsync(job, cancellationToken);

            var catalogItem = await catalog.GetCatalogItemAsync(job.Repository, cancellationToken);
            var proposal = await aiEngine.AnalyzeAsync(
                job.Title,
                job.Description,
                catalogItem?.TriageGuidelines,
                cancellationToken
            );

            var isHumanReview = string.IsNullOrWhiteSpace(proposal.ProblemSummary) ||
                                proposal.ProblemSummary.Contains("[REVISÃO MANUAL]", StringComparison.OrdinalIgnoreCase);

            if (isHumanReview)
            {
                var reviewComment = FormatHumanReviewComment(proposal);

                // Publish review comment to GitHub issue
                await publisher.PublishCommentAsync(
                    job.Repository,
                    job.IssueNumber,
                    reviewComment,
                    cancellationToken
                );

                job.RequireHumanReview(proposal.ProblemSummary, proposal, DateTime.UtcNow);
                await repository.SaveAsync(job, cancellationToken);

                logger.LogInformation("Job '{JobId}' published human review request comment on GitHub for #{IssueNumber} in '{Repository}'.",
                    jobId, job.IssueNumber, job.Repository);
                return;
            }

            var commentMarkdown = FormatTriageComment(proposal);

            // Post comment to GitHub
            await publisher.PublishCommentAsync(
                job.Repository,
                job.IssueNumber,
                commentMarkdown,
                cancellationToken
            );

            // Mark job as Published
            job.Publish(proposal, DateTime.UtcNow);
            await repository.SaveAsync(job, cancellationToken);

            logger.LogInformation("Job '{JobId}' published triage diagnosis successfully for #{IssueNumber} in '{Repository}'.",
                jobId, job.IssueNumber, job.Repository);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unexpected error processing triage job '{JobId}'.", jobId);
            job.RequireHumanReview($"Processing failed: {ex.Message}");
            await repository.SaveAsync(job, cancellationToken);
        }
    }

    private static string FormatTriageComment(TriageProposal proposal)
    {
        return $"""
                ## 🤖 Triagem Automática de Manutenção

                - **Categoria Identificada:** `{proposal.Category}`
                - **Resumo do Problema:**
                {proposal.ProblemSummary}

                - **Próximos Passos Recomendados:**
                {proposal.SuggestedAction}

                ---
                *Triagem realizada de acordo com as diretrizes do repositório.*
                """;
    }

    private static string FormatHumanReviewComment(TriageProposal proposal)
    {
        return $"""
                ## ⚠️ Triagem Automática: Informações Adicionais Necessárias

                - **Diagnóstico Preliminar:**
                {proposal.ProblemSummary}

                - **Ação Solicitada ao Autor:**
                {proposal.SuggestedAction}

                ---
                *Esta issue foi encaminhada para **Revisão Humana** devido à ausência de evidências técnicas conclusivas ou passos de reprodução.*
                """;
    }
}
