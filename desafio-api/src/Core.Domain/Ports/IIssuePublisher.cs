namespace SoftwareTriage.Core.Domain.Ports;

public interface IIssuePublisher
{
    Task PublishCommentAsync(
        string repository,
        int issueNumber,
        string commentMarkdown,
        CancellationToken cancellationToken = default);
}
