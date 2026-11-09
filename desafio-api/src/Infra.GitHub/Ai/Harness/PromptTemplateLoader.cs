using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace SoftwareTriage.Infra.GitHub.Ai.Harness;

public sealed class PromptTemplateLoader
{
    private readonly ILogger<PromptTemplateLoader> _logger;
    private readonly ConcurrentDictionary<string, string> _templates = new(StringComparer.OrdinalIgnoreCase);

    public PromptTemplateLoader(ILogger<PromptTemplateLoader> logger)
    {
        _logger = logger;
    }

    public string LoadTemplate(string templateName, IDictionary<string, string>? variables = null)
    {
        var rawContent = _templates.GetOrAdd(templateName, name =>
        {
            var fileName = name.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ? name : $"{name}.md";

            var searchPaths = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Ai", "Prompts", fileName),
                Path.Combine(AppContext.BaseDirectory, "Prompts", fileName),
                Path.Combine(Directory.GetCurrentDirectory(), "src", "Infra.GitHub", "Ai", "Prompts", fileName),
                Path.Combine(Directory.GetCurrentDirectory(), "Ai", "Prompts", fileName),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "src", "Infra.GitHub", "Ai", "Prompts", fileName)
            };

            var resolvedPath = searchPaths.FirstOrDefault(File.Exists);
            if (resolvedPath is null)
            {
                _logger.LogWarning("Prompt template '{TemplateName}' not found in search paths. Using fallback.", templateName);
                return string.Empty;
            }

            _logger.LogDebug("Loaded prompt template '{TemplateName}' from {Path}", templateName, resolvedPath);
            return File.ReadAllText(resolvedPath);
        });

        if (string.IsNullOrWhiteSpace(rawContent))
        {
            return string.Empty;
        }

        if (variables is null || variables.Count == 0)
        {
            return rawContent;
        }

        var interpolated = rawContent;
        foreach (var (key, value) in variables)
        {
            interpolated = interpolated.Replace($"{{{{{key}}}}}", value ?? string.Empty);
        }

        return interpolated;
    }
}
