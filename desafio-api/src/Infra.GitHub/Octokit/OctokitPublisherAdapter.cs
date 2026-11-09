using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Octokit;
using SoftwareTriage.Core.Domain.Ports;

namespace SoftwareTriage.Infra.GitHub.Octokit;

public sealed class OctokitPublisherAdapter : IIssuePublisher
{
    private readonly ILogger<OctokitPublisherAdapter> _logger;
    private readonly IGitHubClient _gitHubClient;

    public OctokitPublisherAdapter(IConfiguration configuration, ILogger<OctokitPublisherAdapter> logger)
    {
        _logger = logger;
        var token = configuration["GitHub:Token"]
                    ?? configuration["GITHUB_TOKEN"]
                    ?? System.Environment.GetEnvironmentVariable("GITHUB_TOKEN");

        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("GitHub Token must be provided in environment variable GITHUB_TOKEN or configuration GitHub:Token.");
        }

        _gitHubClient = new GitHubClient(new ProductHeaderValue("SoftwareTriageBot"))
        {
            Credentials = new Credentials(token)
        };
        _logger.LogInformation("OctokitPublisherAdapter initialized with authenticated GitHub credentials.");
    }

    public async Task PublishCommentAsync(
        string repository,
        int issueNumber,
        string commentMarkdown,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(repository);
        ArgumentNullException.ThrowIfNull(commentMarkdown);

        var parts = repository.Split('/');
        if (parts.Length != 2)
        {
            throw new ArgumentException($"Invalid repository format '{repository}'. Expected 'owner/repo'.", nameof(repository));
        }

        var owner = parts[0];
        var repoName = parts[1];

        _logger.LogInformation("Publishing comment to GitHub on {Owner}/{Repo}#{IssueNumber}...", owner, repoName, issueNumber);
        await _gitHubClient.Issue.Comment.Create(owner, repoName, issueNumber, commentMarkdown);
        _logger.LogInformation("Successfully published comment to GitHub on {Owner}/{Repo}#{IssueNumber}.", owner, repoName, issueNumber);
    }
}
