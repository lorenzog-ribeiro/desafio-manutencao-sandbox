using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SoftwareTriage.Core.Domain.Entities;
using SoftwareTriage.Core.Domain.Ports;

namespace SoftwareTriage.Infra.GitHub.Catalog;

public sealed class JsonProjectCatalogAdapter : IProjectCatalog
{
    private readonly ILogger<JsonProjectCatalogAdapter> _logger;
    private readonly ConcurrentDictionary<string, ProjectCatalogItem> _catalog = new(StringComparer.OrdinalIgnoreCase);

    public JsonProjectCatalogAdapter(ILogger<JsonProjectCatalogAdapter> logger)
    {
        _logger = logger;
        LoadCatalog();
    }

    public Task<bool> IsAcceptedAsync(string repository, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(repository))
            return Task.FromResult(false);

        var trimmed = repository.Trim();

        // 1. Direct catalog lookup
        if (_catalog.TryGetValue(trimmed, out var item) && item.IsActive)
            return Task.FromResult(true);

        // 2. Automatically accept repositories belonging to the authenticated user
        if (trimmed.StartsWith("lorenzog-ribeiro/", StringComparison.OrdinalIgnoreCase))
        {
            var defaultItem = new ProjectCatalogItem(
                trimmed,
                "lorenzog-ribeiro",
                "Repositório pessoal do mantenedor. Validar requisitos e critérios de aceitação.",
                true
            );
            _catalog.TryAdd(trimmed, defaultItem);
            return Task.FromResult(true);
        }

        return Task.FromResult(false);
    }

    public Task<ProjectCatalogItem?> GetCatalogItemAsync(string repository, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(repository))
            return Task.FromResult<ProjectCatalogItem?>(null);

        var trimmed = repository.Trim();
        if (_catalog.TryGetValue(trimmed, out var item))
            return Task.FromResult<ProjectCatalogItem?>(item);

        if (trimmed.StartsWith("lorenzog-ribeiro/", StringComparison.OrdinalIgnoreCase))
        {
            var defaultItem = new ProjectCatalogItem(
                trimmed,
                "lorenzog-ribeiro",
                "Repositório pessoal do mantenedor. Validar requisitos e critérios de aceitação.",
                true
            );
            _catalog.TryAdd(trimmed, defaultItem);
            return Task.FromResult<ProjectCatalogItem?>(defaultItem);
        }

        return Task.FromResult<ProjectCatalogItem?>(null);
    }

    public void RegisterRepository(string repository, string maintainer, string guidelines)
    {
        if (string.IsNullOrWhiteSpace(repository)) return;
        var item = new ProjectCatalogItem(repository.Trim(), maintainer, guidelines, true);
        _catalog[repository.Trim()] = item;
    }

    private void LoadCatalog()
    {
        var possiblePaths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Catalog", "project-catalog.json"),
            Path.Combine(AppContext.BaseDirectory, "project-catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "Catalog", "project-catalog.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "project-catalog.json")
        };

        var filePath = possiblePaths.FirstOrDefault(File.Exists);
        if (filePath is null)
        {
            _logger.LogWarning("Project catalog JSON file not found in search paths. Using default configuration.");
            return;
        }

        try
        {
            var json = File.ReadAllText(filePath);
            var items = JsonSerializer.Deserialize<List<CatalogItemModel>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (items is not null)
            {
                foreach (var item in items)
                {
                    _catalog[item.Repository] = new ProjectCatalogItem(
                        item.Repository,
                        item.Maintainer ?? "unknown",
                        item.TriageGuidelines ?? string.Empty,
                        item.IsActive
                    );
                }
            }

            _logger.LogInformation("Successfully loaded {Count} repositories into catalog.", _catalog.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse project catalog file at {Path}.", filePath);
        }
    }

    private sealed record CatalogItemModel(
        string Repository,
        string? Maintainer,
        string? TriageGuidelines,
        bool IsActive = true
    );
}
