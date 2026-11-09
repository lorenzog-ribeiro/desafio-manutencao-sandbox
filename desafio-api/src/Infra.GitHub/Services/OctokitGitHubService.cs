using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Octokit;
using SoftwareTriage.Core.Application.DTOs;
using SoftwareTriage.Core.Application.Ports;

namespace SoftwareTriage.Infra.GitHub.Services;

public sealed class OctokitGitHubService : IGitHubService
{
    private readonly ILogger<OctokitGitHubService> _logger;
    private readonly IGitHubClient? _client;
    private readonly bool _isConfigured;

    public OctokitGitHubService(IConfiguration configuration, ILogger<OctokitGitHubService> logger)
    {
        _logger = logger;
        var token = configuration["GitHub:Token"]
                    ?? configuration["GITHUB_TOKEN"]
                    ?? Environment.GetEnvironmentVariable("GITHUB_TOKEN");

        if (!string.IsNullOrWhiteSpace(token) && !token.Equals("mock", StringComparison.OrdinalIgnoreCase))
        {
            _client = new GitHubClient(new ProductHeaderValue("SoftwareTriageHub"))
            {
                Credentials = new Credentials(token)
            };
            _isConfigured = true;
            _logger.LogInformation("OctokitGitHubService initialized successfully with authentication token.");
        }
        else
        {
            _logger.LogWarning("GitHub token not configured or set to mock. GitHub live service running in unauthenticated mode.");
            _isConfigured = false;
        }
    }

    public async Task<IReadOnlyList<GitHubRepoDto>> GetUserRepositoriesAsync(CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _client is null)
        {
            _logger.LogWarning("Cannot fetch user repositories: GitHub token is not configured.");
            return [];
        }

        try
        {
            _logger.LogInformation("Fetching authenticated user repositories from GitHub API...");
            var repos = await _client.Repository.GetAllForCurrent(new RepositoryRequest
            {
                Sort = RepositorySort.Updated,
                Direction = SortDirection.Descending
            });

            return repos.Select(r => new GitHubRepoDto(
                r.Id,
                r.Name,
                r.FullName,
                r.Owner.Login,
                r.HtmlUrl,
                r.Description,
                r.OpenIssuesCount,
                r.Private
            )).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve repositories from GitHub API.");
            throw;
        }
    }

    public async Task<IReadOnlyList<GitHubIssueDto>> GetRepositoryIssuesAsync(
        string owner,
        string repo,
        CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _client is null)
        {
            _logger.LogWarning("Cannot fetch repository issues: GitHub token is not configured.");
            return [];
        }

        try
        {
            _logger.LogInformation("Fetching issues for {Owner}/{Repo} from GitHub...", owner, repo);
            var issues = await _client.Issue.GetAllForRepository(owner, repo, new RepositoryIssueRequest
            {
                State = ItemStateFilter.Open,
                SortProperty = IssueSort.Updated,
                SortDirection = SortDirection.Descending
            });

            // Filter out pull requests (GitHub API returns pull requests as issues with PullRequest property set)
            return issues
                .Where(i => i.PullRequest is null)
                .Select(i => new GitHubIssueDto(
                    i.Id,
                    i.Number,
                    i.Title,
                    i.Body,
                    i.State.StringValue,
                    i.HtmlUrl,
                    i.User?.Login,
                    i.CreatedAt.UtcDateTime
                )).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve issues for {Owner}/{Repo} from GitHub API.", owner, repo);
            throw;
        }
    }

    public async Task<GitHubIssueDto?> GetIssueAsync(
        string owner,
        string repo,
        int issueNumber,
        CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _client is null)
        {
            _logger.LogWarning("Cannot fetch issue: GitHub token is not configured.");
            return null;
        }

        try
        {
            _logger.LogInformation("Fetching issue #{IssueNumber} for {Owner}/{Repo} from GitHub...", issueNumber, owner, repo);
            var issue = await _client.Issue.Get(owner, repo, issueNumber);
            if (issue is null) return null;

            return new GitHubIssueDto(
                issue.Id,
                issue.Number,
                issue.Title,
                issue.Body,
                issue.State.StringValue,
                issue.HtmlUrl,
                issue.User?.Login,
                issue.CreatedAt.UtcDateTime
            );
        }
        catch (NotFoundException)
        {
            _logger.LogWarning("Issue #{IssueNumber} not found in {Owner}/{Repo}.", issueNumber, owner, repo);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve issue #{IssueNumber} for {Owner}/{Repo}.", issueNumber, owner, repo);
            throw;
        }
    }

    public async Task<GitHubIssueDto> CreateIssueAsync(
        string owner,
        string repo,
        string title,
        string? body,
        CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _client is null)
        {
            throw new InvalidOperationException("GitHub token is not configured.");
        }

        try
        {
            _logger.LogInformation("Creating new issue in {Owner}/{Repo}: '{Title}'", owner, repo, title);
            var newIssue = new NewIssue(title)
            {
                Body = body ?? string.Empty
            };

            var issue = await _client.Issue.Create(owner, repo, newIssue);
            return new GitHubIssueDto(
                issue.Id,
                issue.Number,
                issue.Title,
                issue.Body,
                issue.State.StringValue,
                issue.HtmlUrl,
                issue.User?.Login,
                issue.CreatedAt.UtcDateTime
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create issue in {Owner}/{Repo}.", owner, repo);
            throw;
        }
    }

    public async Task<bool> DeleteOrCloseIssueAsync(
        string owner,
        string repo,
        int issueNumber,
        CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _client is null)
        {
            throw new InvalidOperationException("GitHub token is not configured.");
        }

        try
        {
            var endpoint = new Uri($"repos/{owner}/{repo}/issues/{issueNumber}", UriKind.Relative);
            await _client.Connection.Delete(endpoint);
            _logger.LogInformation("Successfully deleted issue #{IssueNumber} in {Owner}/{Repo}.", issueNumber, owner, repo);
            return true;
        }
        catch
        {
            var update = new IssueUpdate { State = ItemState.Closed };
            await _client.Issue.Update(owner, repo, issueNumber, update);
            _logger.LogInformation("Successfully closed issue #{IssueNumber} in {Owner}/{Repo}.", issueNumber, owner, repo);
            return true;
        }
    }
}
