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
var rawConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration["DATABASE_URL"]
    ?? Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

string connectionString;
if (!string.IsNullOrWhiteSpace(rawConnectionString) &&
    (rawConnectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
     rawConnectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)))
{
    var uri = new Uri(rawConnectionString);
    var userInfo = uri.UserInfo.Split(':');
    var user = userInfo[0];
    var pass = userInfo.Length > 1 ? userInfo[1] : "";
    var dbHost = uri.Host;
    var port = uri.Port > 0 ? uri.Port : 5432;
    var db = uri.AbsolutePath.TrimStart('/');
    connectionString = $"Host={dbHost};Port={port};Database={db};Username={user};Password={pass}";
}
else if (!string.IsNullOrWhiteSpace(rawConnectionString))
{
    connectionString = rawConnectionString;
}
else
{
    var pgHost = builder.Configuration["POSTGRES_HOST"] ?? Environment.GetEnvironmentVariable("POSTGRES_HOST") ?? "postgres";
    var pgPort = builder.Configuration["POSTGRES_PORT"] ?? Environment.GetEnvironmentVariable("POSTGRES_PORT") ?? "5432";
    var pgDb = builder.Configuration["POSTGRES_DB"] ?? Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "triage_db";
    var pgUser = builder.Configuration["POSTGRES_USER"] ?? Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "postgres";
    var pgPass = builder.Configuration["POSTGRES_PASSWORD"] ?? Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "postgres";
    connectionString = $"Host={pgHost};Port={pgPort};Database={pgDb};Username={pgUser};Password={pgPass}";
}

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
