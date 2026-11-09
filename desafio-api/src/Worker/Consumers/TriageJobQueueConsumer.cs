using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SoftwareTriage.Core.Application.Ports;
using SoftwareTriage.Core.Application.UseCases;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;

namespace SoftwareTriage.Worker.Consumers;

public sealed class TriageJobQueueConsumer(
    IServiceScopeFactory scopeFactory,
    ITriageJobQueue queue,
    ILogger<TriageJobQueueConsumer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("TriageJobQueueConsumer started. Listening for triage jobs...");

        // Run in-memory queue reader loop and periodic DB sweep concurrently
        var channelConsumerTask = ConsumeFromChannelAsync(stoppingToken);
        var dbPollingTask = PollPendingJobsFromDatabaseAsync(stoppingToken);

        await Task.WhenAll(channelConsumerTask, dbPollingTask);
    }

    private async Task ConsumeFromChannelAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var jobId in queue.DequeueAllAsync(stoppingToken))
            {
                logger.LogInformation("Received job '{JobId}' from triage channel.", jobId);
                await ProcessJobAsync(jobId, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Graceful shutdown
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error while reading from triage job channel.");
        }
    }

    private async Task PollPendingJobsFromDatabaseAsync(CancellationToken stoppingToken)
    {
        // Polling loop ensures jobs persisted across processes (e.g., Worker running separately from API) are processed
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var repository = scope.ServiceProvider.GetRequiredService<ITriageJobRepository>();
                var pendingJobs = await repository.GetPendingJobsAsync(stoppingToken);

                foreach (var job in pendingJobs)
                {
                    logger.LogInformation("Database sweep picked up pending job '{JobId}'.", job.Id);
                    await ProcessJobAsync(job.Id, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error occurred during database triage job polling sweep.");
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private async Task ProcessJobAsync(TriageJobId jobId, CancellationToken stoppingToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var useCase = scope.ServiceProvider.GetRequiredService<ProcessTriageJobUseCase>();
            await useCase.ExecuteAsync(jobId, stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to execute ProcessTriageJobUseCase for job '{JobId}'.", jobId);
        }
    }
}
