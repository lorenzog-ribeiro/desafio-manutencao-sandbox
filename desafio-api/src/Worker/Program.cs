using Microsoft.EntityFrameworkCore;
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
using SoftwareTriage.Worker.Consumers;

// Load environment variables from .env if present
EnvLoader.Load();

var builder = Host.CreateApplicationBuilder(args);

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
builder.Services.AddScoped<ProcessTriageJobUseCase>();

// Hosted Consumer
builder.Services.AddHostedService<TriageJobQueueConsumer>();

var host = builder.Build();
host.Run();
