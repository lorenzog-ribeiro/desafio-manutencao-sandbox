using SoftwareTriage.Core.Application.DTOs;

namespace SoftwareTriage.Core.Application.Ports;

public interface IGitHubService
{
    Task<IReadOnlyList<GitHubRepoDto>> GetUserRepositoriesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<GitHubIssueDto>> GetRepositoryIssuesAsync(string owner, string repo, CancellationToken cancellationToken = default);
    Task<GitHubIssueDto?> GetIssueAsync(string owner, string repo, int issueNumber, CancellationToken cancellationToken = default);
    Task<GitHubIssueDto> CreateIssueAsync(string owner, string repo, string title, string? body, CancellationToken cancellationToken = default);
    Task<bool> DeleteOrCloseIssueAsync(string owner, string repo, int issueNumber, CancellationToken cancellationToken = default);
}
