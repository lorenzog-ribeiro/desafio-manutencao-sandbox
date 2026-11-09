using System.Threading.Channels;
using SoftwareTriage.Core.Application.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Core.Application.Queues;

public sealed class ChannelTriageJobQueue : ITriageJobQueue
{
    private readonly Channel<TriageJobId> _channel = Channel.CreateUnbounded<TriageJobId>(
        new UnboundedChannelOptions
        {
            SingleReader = false,
            SingleWriter = false
        });

    public ValueTask EnqueueAsync(TriageJobId jobId, CancellationToken cancellationToken = default)
    {
        return _channel.Writer.WriteAsync(jobId, cancellationToken);
    }

    public IAsyncEnumerable<TriageJobId> DequeueAllAsync(CancellationToken cancellationToken = default)
    {
        return _channel.Reader.ReadAllAsync(cancellationToken);
    }
}
