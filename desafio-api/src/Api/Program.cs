using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SoftwareTriage.Core.Application.DTOs;
using SoftwareTriage.Core.Application.Ports;
using SoftwareTriage.Core.Application.Queues;
using SoftwareTriage.Core.Application.UseCases;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Infra.Data.Context;
using SoftwareTriage.Infra.Data.Repositories;
using SoftwareTriage.Infra.GitHub.Ai;
using SoftwareTriage.Infra.GitHub.Ai.Harness;
using SoftwareTriage.Infra.GitHub.Catalog;
using SoftwareTriage.Infra.GitHub.Common;
using SoftwareTriage.Infra.GitHub.Octokit;
using SoftwareTriage.Infra.GitHub.Services;
using SoftwareTriage.Infra.GitHub.Webhooks;

// Load environment variables from .env if present
EnvLoader.Load();

var builder = WebApplication.CreateBuilder(args);

// Database configuration
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Port=5432;Database=triage_db;Username=postgres;Password=postgres";

builder.Services.AddDbContext<TriageDbContext>(options =>
{
    options.UseNpgsql(connectionString);
});

// Queue singleton
builder.Services.AddSingleton<ITriageJobQueue, ChannelTriageJobQueue>();

// Ports and Adapters
builder.Services.AddSingleton<PromptTemplateLoader>();
builder.Services.AddScoped<ITriageJobRepository, EfTriageJobRepository>();
builder.Services.AddSingleton<IProjectCatalog, JsonProjectCatalogAdapter>();
builder.Services.AddScoped<IIssuePublisher, OctokitPublisherAdapter>();
builder.Services.AddScoped<IAiTriageEngine, AiHarnessEngine>();
builder.Services.AddScoped<IGitHubService, OctokitGitHubService>();

// UseCases
builder.Services.AddScoped<ReceiveEventUseCase>();
builder.Services.AddScoped<ProcessTriageJobUseCase>();
builder.Services.AddScoped<GetTriageResultUseCase>();

// CORS configuration for Angular frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowAngularApp");

// Auto-migration / ensure database schema created on startup
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<TriageDbContext>();
        await db.Database.EnsureCreatedAsync();
        logger.LogInformation("Database verified and schema ensured.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not ensure database schema at startup. Ensure Postgres is running.");
    }
}

// Minimal API Endpoints
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    service = "SoftwareTriage.Api",
    timestamp = DateTime.UtcNow
}));

// ==========================================
// 1. Direct normalized event ingest
// ==========================================
app.MapPost("/events", async (
    [FromBody] IncomingIssueEventDto dto,
    [FromServices] ReceiveEventUseCase useCase,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(dto.EventId) ||
        string.IsNullOrWhiteSpace(dto.Repository) ||
        dto.IssueNumber <= 0)
    {
        return Results.BadRequest(new { error = "Invalid event payload. EventId, Repository and valid IssueNumber are required." });
    }

    var result = await useCase.ExecuteAsync(dto, cancellationToken);
    return Results.Accepted($"/issues/{dto.Repository}/{dto.IssueNumber}", new
    {
        eventId = result.EventId,
        status = result.Status
    });
});

// ==========================================
// 2. Official GitHub Webhook Endpoint
// ==========================================
app.MapPost("/webhooks/github", async (
    HttpRequest request,
    [FromServices] ReceiveEventUseCase useCase,
    [FromServices] ITriageJobRepository triageJobRepo,
    [FromServices] IConfiguration configuration,
    [FromServices] ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    using var reader = new StreamReader(request.Body);
    var rawBody = await reader.ReadToEndAsync(cancellationToken);

    var githubEvent = request.Headers["X-GitHub-Event"].ToString();
    var deliveryId = request.Headers["X-GitHub-Delivery"].ToString();
    var signature = request.Headers["X-Hub-Signature-256"].ToString();
    var secret = configuration["GitHub:WebhookSecret"];

    logger.LogInformation("Received GitHub Webhook. Event: '{Event}', Delivery: '{DeliveryId}'", githubEvent, deliveryId);

    // Optional signature verification
    if (!GitHubWebhookSecurity.VerifySignature(rawBody, signature, secret))
    {
        logger.LogWarning("GitHub Webhook signature verification failed for delivery '{DeliveryId}'.", deliveryId);
        return Results.Unauthorized();
    }

    // Ping event
    if (string.Equals(githubEvent, "ping", StringComparison.OrdinalIgnoreCase))
    {
        logger.LogInformation("GitHub Webhook ping acknowledged.");
        return Results.Ok(new { message = "GitHub Webhook ping received successfully!" });
    }

    // Issues event
    if (string.Equals(githubEvent, "issues", StringComparison.OrdinalIgnoreCase))
    {
        var payload = JsonSerializer.Deserialize<GitHubWebhookPayload>(rawBody, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (payload?.Issue is null || payload.Repository is null)
        {
            return Results.BadRequest(new { error = "Missing issue or repository object in webhook payload." });
        }

        string[] triageableActions = ["opened", "reopened"];
        if (!triageableActions.Contains(payload.Action, StringComparer.OrdinalIgnoreCase))
        {
            logger.LogInformation("Ignoring non-triageable issue action '{Action}'.", payload.Action);
            return Results.Ok(new { message = $"Action '{payload.Action}' ignored." });
        }

        // Check if already triaged recently to prevent duplicate webhook delivery execution
        var existingJob = await triageJobRepo.GetByRepoAndNumberAsync(payload.Repository.FullName, payload.Issue.Number, cancellationToken);
        if (existingJob is not null && (existingJob.Status == SoftwareTriage.Core.Domain.ValueObjects.TriageStatus.Accepted ||
                                       existingJob.Status == SoftwareTriage.Core.Domain.ValueObjects.TriageStatus.Processing ||
                                       existingJob.PublishedAt.HasValue && DateTime.UtcNow - existingJob.PublishedAt.Value < TimeSpan.FromMinutes(2)))
        {
            logger.LogInformation("Issue #{IssueNumber} in '{Repo}' was already triaged recently. Skipping duplicate comment.", payload.Issue.Number, payload.Repository.FullName);
            return Results.Ok(new { message = $"Issue #{payload.Issue.Number} was already triaged recently." });
        }

        var eventId = !string.IsNullOrWhiteSpace(deliveryId)
            ? deliveryId
            : $"gh-{payload.Issue.Id}-{payload.Action}";

        var dto = new IncomingIssueEventDto(
            EventId: eventId,
            Repository: payload.Repository.FullName,
            IssueNumber: payload.Issue.Number,
            Title: payload.Issue.Title,
            Description: payload.Issue.Body ?? string.Empty
        );

        var result = await useCase.ExecuteAsync(dto, cancellationToken);

        return Results.Accepted($"/issues/{dto.Repository}/{dto.IssueNumber}", new
        {
            eventId = result.EventId,
            repository = result.Repository,
            issueNumber = result.IssueNumber,
            status = result.Status
        });
    }

    return Results.Ok(new { message = $"Event type '{githubEvent}' ignored." });
});

// ==========================================
// 3. Live GitHub Data: Repositories & Issues
// ==========================================
app.MapGet("/github/repos", async (
    [FromServices] IGitHubService gitHubService,
    CancellationToken cancellationToken) =>
{
    var repos = await gitHubService.GetUserRepositoriesAsync(cancellationToken);
    return Results.Ok(repos);
});

app.MapGet("/github/repos/{owner}/{repo}/issues", async (
    string owner,
    string repo,
    [FromServices] IGitHubService gitHubService,
    CancellationToken cancellationToken) =>
{
    var issues = await gitHubService.GetRepositoryIssuesAsync(owner, repo, cancellationToken);
    return Results.Ok(issues);
});

app.MapPost("/github/repos/{owner}/{repo}/issues/{issueNumber:int}/triage", async (
    string owner,
    string repo,
    int issueNumber,
    [FromServices] IGitHubService gitHubService,
    [FromServices] ReceiveEventUseCase receiveEventUseCase,
    [FromServices] ITriageJobRepository triageJobRepo,
    CancellationToken cancellationToken) =>
{
    var repositoryName = $"{owner}/{repo}";
    var existingJob = await triageJobRepo.GetByRepoAndNumberAsync(repositoryName, issueNumber, cancellationToken);
    if (existingJob is not null && (existingJob.Status == SoftwareTriage.Core.Domain.ValueObjects.TriageStatus.Accepted || existingJob.Status == SoftwareTriage.Core.Domain.ValueObjects.TriageStatus.Processing))
    {
        return Results.Accepted($"/issues/{owner}/{repo}/{issueNumber}", new TriageResultDto(
            existingJob.EventId,
            existingJob.Repository,
            existingJob.IssueNumber,
            existingJob.Title,
            existingJob.Status.ToString(),
            existingJob.Proposal?.Category.ToString(),
            existingJob.Proposal?.ProblemSummary,
            existingJob.Proposal?.SuggestedAction,
            existingJob.PublishedAt,
            existingJob.FailureReason
        ));
    }

    var issue = await gitHubService.GetIssueAsync(owner, repo, issueNumber, cancellationToken);
    if (issue is null)
    {
        return Results.NotFound(new { error = $"Issue #{issueNumber} not found in {owner}/{repo}" });
    }

    var eventId = $"manual-{owner}-{repo}-{issueNumber}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
    var dto = new IncomingIssueEventDto(
        EventId: eventId,
        Repository: $"{owner}/{repo}",
        IssueNumber: issue.Number,
        Title: issue.Title,
        Description: issue.Body ?? string.Empty
    );

    var result = await receiveEventUseCase.ExecuteAsync(dto, cancellationToken);

    return Results.Accepted($"/issues/{owner}/{repo}/{issueNumber}", result);
});

// ==========================================
// 4. Queries for Triage Status & Results
// ==========================================
app.MapGet("/issues/{owner}/{repo}/{issueNumber:int}", async (
    string owner,
    string repo,
    int issueNumber,
    [FromServices] GetTriageResultUseCase useCase,
    CancellationToken cancellationToken) =>
{
    var repositoryName = $"{owner}/{repo}";
    var result = await useCase.ExecuteAsync(repositoryName, issueNumber, cancellationToken);

    return result is not null
        ? Results.Ok(result)
        : Results.NotFound(new { error = $"Triage job not found for {repositoryName}#{issueNumber}" });
});

app.MapGet("/jobs", async (
    [FromServices] GetTriageResultUseCase useCase,
    [FromQuery] int limit = 50,
    CancellationToken cancellationToken = default) =>
{
    var jobs = await useCase.ListRecentAsync(limit, cancellationToken);
    return Results.Ok(jobs);
});

app.Run();
