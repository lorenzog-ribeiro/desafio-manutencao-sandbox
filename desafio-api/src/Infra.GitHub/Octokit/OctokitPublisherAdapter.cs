using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Octokit;
using SoftwareTriage.Core.Domain.Ports;

namespace SoftwareTriage.Infra.GitHub.Octokit;

public sealed class OctokitPublisherAdapter : IIssuePublisher
{
    private readonly ILogger<OctokitPublisherAdapter> _logger;
    private readonly IGitHubClient? _gitHubClient;
    private readonly bool _isConfigured;

    public OctokitPublisherAdapter(IConfiguration configuration, ILogger<OctokitPublisherAdapter> logger)
    {
        _logger = logger;
        var token = (configuration["GitHub:Token"]
                    ?? configuration["GITHUB_TOKEN"]
                    ?? System.Environment.GetEnvironmentVariable("GITHUB_TOKEN")
                    ?? string.Empty).Trim('"', '\'', ' ', '\r', '\n');

        if (!string.IsNullOrWhiteSpace(token) &&
            !token.Equals("mock", StringComparison.OrdinalIgnoreCase) &&
            !token.StartsWith("ghp_seu_", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                _gitHubClient = new GitHubClient(new ProductHeaderValue("SoftwareTriageBot"))
                {
                    Credentials = new Credentials(token)
                };
                _isConfigured = true;
                _logger.LogInformation("OctokitPublisherAdapter initialized with authenticated GitHub credentials.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to initialize Octokit credentials. Falling back to simulation mode.");
                _isConfigured = false;
            }
        }
        else
        {
            _logger.LogWarning("GitHub Token not configured or set to placeholder. Operating in simulation mode (comments will not be posted to live issues).");
            _isConfigured = false;
        }
    }

    public async Task PublishCommentAsync(
        string repository,
        int issueNumber,
        string commentMarkdown,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(repository);
        ArgumentNullException.ThrowIfNull(commentMarkdown);

        if (!_isConfigured || _gitHubClient is null)
        {
            _logger.LogWarning("Skipping GitHub comment on {Repository}#{IssueNumber}: GITHUB_TOKEN is not configured or in simulation mode.", repository, issueNumber);
            return;
        }

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
