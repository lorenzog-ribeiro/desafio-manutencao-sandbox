using System.Text.Json;
using Google.GenAI;
using Google.GenAI.Types;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SoftwareTriage.Core.Domain.Ports;
using SoftwareTriage.Core.Domain.ValueObjects;
using SoftwareTriage.Infra.GitHub.Ai.Harness;

namespace SoftwareTriage.Infra.GitHub.Ai;

public sealed class AiHarnessEngine : IAiTriageEngine
{
    private readonly ILogger<AiHarnessEngine> _logger;
    private readonly PromptTemplateLoader _templateLoader;
    private readonly Client? _geminiClient;
    private readonly string _modelName;
    private readonly bool _isConfigured;

    public AiHarnessEngine(
        IConfiguration configuration,
        PromptTemplateLoader templateLoader,
        ILogger<AiHarnessEngine> logger)
    {
        _logger = logger;
        _templateLoader = templateLoader;

        var apiKey = configuration["Google:ApiKey"]
                     ?? configuration["GEMINI_API_KEY"]
                     ?? System.Environment.GetEnvironmentVariable("GEMINI_API_KEY");

        _modelName = configuration["Google:Model"] ?? "gemini-2.5-flash";

        if (!string.IsNullOrWhiteSpace(apiKey) && !apiKey.Equals("mock", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                _geminiClient = new Client(apiKey: apiKey);
                _isConfigured = true;
                _logger.LogInformation("Google Gemini AI Client initialized successfully using model '{Model}'.", _modelName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to initialize Google Gemini Client. Falling back to rule-based specialist engine.");
                _isConfigured = false;
            }
        }
        else
        {
            _logger.LogInformation("GEMINI_API_KEY not configured or set to mock. Running AI Harness in local specialist simulation mode.");
            _isConfigured = false;
        }
    }

    public async Task<TriageProposal> AnalyzeAsync(
        string title,
        string description,
        string? guidelines = null,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting AI Triage analysis for: '{Title}' (Live Gemini Configured: {IsConfigured})", title, _isConfigured);

        var templateVars = new Dictionary<string, string>
        {
            ["TITLE"] = title ?? string.Empty,
            ["DESCRIPTION"] = description ?? string.Empty,
            ["GUIDELINES"] = !string.IsNullOrWhiteSpace(guidelines)
                ? guidelines
                : "Seguir boas práticas de Clean Architecture, separação de camadas e cobertura de testes unitários."
        };

        var safeTitle = title ?? string.Empty;
        var safeDescription = description ?? string.Empty;

        if (_isConfigured && _geminiClient is not null)
        {
            try
            {
                return await AnalyzeWithGeminiAsync(safeTitle, safeDescription, templateVars, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Gemini API call failed. Falling back to local specialist rule engine.");
            }
        }

        return RunLocalSpecialistEngine(safeTitle, safeDescription, guidelines, templateVars);
    }

    private async Task<TriageProposal> AnalyzeWithGeminiAsync(
        string title,
        string description,
        IDictionary<string, string> templateVars,
        CancellationToken cancellationToken)
    {
        var routerPrompt = _templateLoader.LoadTemplate("router-agent", templateVars);
        var bugPrompt = _templateLoader.LoadTemplate("bug-specialist", templateVars);
        var enhancementPrompt = _templateLoader.LoadTemplate("enhancement-specialist", templateVars);
        var toolsSpec = _templateLoader.LoadTemplate("tools-spec", templateVars);

        var systemInstructions = $$"""
            {{routerPrompt}}

            ---
            ESPECIALISTA EM BUGS:
            {{bugPrompt}}

            ---
            ESPECIALISTA EM MELHORIAS:
            {{enhancementPrompt}}

            ---
            ESPECIFICAÇÃO DE FERRAMENTAS & CONTRATO DE SAÍDA:
            {{toolsSpec}}

            INSTRUÇÃO MANDATÓRIA:
            Você deve responder EXCLUSIVAMENTE em formato JSON com o seguinte schema:
            {
               "category": "Bug" | "Melhoria" | "Duvida",
               "problemSummary": "resumo claro do problema ou necessidade técnica",
               "suggestedAction": "passos numerados para solução e testes",
               "requiresHumanReview": true | false,
               "confidenceScore": 0.0 a 1.0,
               "missingInformation": "descrição do que falta caso requiresHumanReview seja true, ou null"
            }
            IMPORTANTE: Se o relato for um bug mas NÃO contiver passos de reprodução nem logs ou stack trace, defina "requiresHumanReview": true e no problemSummary inclua "[REVISÃO MANUAL]".
            """;

        var userMessage = $"""
            Analise e faça a triagem da seguinte issue:
            Título: {title}
            Descrição:
            {description}
            """;

        var config = new GenerateContentConfig
        {
            SystemInstruction = new Content
            {
                Parts = [new Part { Text = systemInstructions }]
            },
            ResponseMimeType = "application/json",
            Temperature = 0.2f
        };

        _logger.LogInformation("Calling Google Gemini ({Model}) with structured JSON output...", _modelName);
        var response = await _geminiClient!.Models.GenerateContentAsync(
            model: _modelName,
            contents: userMessage,
            config: config,
            cancellationToken: cancellationToken
        );

        var jsonText = response.Text;
        _logger.LogInformation("Gemini structured response received:\n{Response}", jsonText);

        if (string.IsNullOrWhiteSpace(jsonText))
        {
            throw new InvalidOperationException("Gemini returned empty response.");
        }

        var result = JsonSerializer.Deserialize<AiTriageResultModel>(jsonText, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (result is null)
        {
            throw new InvalidOperationException("Unable to deserialize Gemini response to AiTriageResultModel.");
        }

        var category = Enum.TryParse<IssueCategory>(result.Category, true, out var parsedCategory)
            ? parsedCategory
            : IssueCategory.Bug;

        var summary = result.ProblemSummary;
        if (result.RequiresHumanReview && !summary.Contains("[REVISÃO MANUAL]", StringComparison.OrdinalIgnoreCase))
        {
            summary = $"[REVISÃO MANUAL] {summary}";
        }

        var action = result.SuggestedAction;
        if (!string.IsNullOrWhiteSpace(result.MissingInformation))
        {
            action += $"\n\n**Informações Solicitadas ao Autor:** {result.MissingInformation}";
        }

        return new TriageProposal(category, summary, action);
    }

    private TriageProposal RunLocalSpecialistEngine(
        string title,
        string description,
        string? guidelines,
        IDictionary<string, string> templateVars)
    {
        _logger.LogInformation("Executing local deterministic specialist harness with markdown templates.");

        var fullText = $"{title} {description}".Trim();

        // 1. Anti-hallucination guardrail for insufficient data
        if (string.IsNullOrWhiteSpace(description) || fullText.Length < 25)
        {
            return new TriageProposal(
                IssueCategory.Duvida,
                "[REVISÃO MANUAL] Descrição da issue incompleta ou excessivamente vaga.",
                "Solicitar ao autor passos para reproduzir o problema, versão do ambiente e logs."
            );
        }

        // 2. Classify intent
        var isBug = fullText.Contains("erro", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("error", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("bug", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("falha", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("crash", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("exception", StringComparison.OrdinalIgnoreCase) ||
                    fullText.Contains("timeout", StringComparison.OrdinalIgnoreCase);

        var isFeature = fullText.Contains("melhoria", StringComparison.OrdinalIgnoreCase) ||
                        fullText.Contains("feature", StringComparison.OrdinalIgnoreCase) ||
                        fullText.Contains("adicionar", StringComparison.OrdinalIgnoreCase) ||
                        fullText.Contains("proposta", StringComparison.OrdinalIgnoreCase) ||
                        fullText.Contains("suporte", StringComparison.OrdinalIgnoreCase) ||
                        fullText.Contains("otimização", StringComparison.OrdinalIgnoreCase);

        if (isBug)
        {
            var hasReproOrLogs = description.Contains("passos", StringComparison.OrdinalIgnoreCase) ||
                                 description.Contains("reproduce", StringComparison.OrdinalIgnoreCase) ||
                                 description.Contains("log", StringComparison.OrdinalIgnoreCase) ||
                                 description.Contains("stack", StringComparison.OrdinalIgnoreCase) ||
                                 description.Contains("exception", StringComparison.OrdinalIgnoreCase);

            if (!hasReproOrLogs && description.Length < 60)
            {
                return new TriageProposal(
                    IssueCategory.Bug,
                    "[REVISÃO MANUAL] Relato de bug identificado, porém faltam passos de reprodução confiáveis ou evidências de log.",
                    "Pedir ao usuário para detalhar o passo a passo de reprodução e anexar os logs de erro."
                );
            }

            var summary = $"Comportamento inesperado relatado em: '{title}'. O relato aponta falha de execução ou anomalia operacional.";
            var action = "1. Isolar o cenário em teste unitário/integração. 2. Inspecionar stack trace ou telemetria associada. 3. Propor correção com pull request direcionado.";
            if (!string.IsNullOrWhiteSpace(guidelines))
            {
                action += $" (Alinhado à diretriz do repositório: {guidelines})";
            }
            return new TriageProposal(IssueCategory.Bug, summary, action);
        }

        if (isFeature)
        {
            var summary = $"Solicitação de evolução ou refinamento funcional: '{title}'.";
            var action = "1. Avaliar impacto na arquitetura existente. 2. Validar viabilidade técnica e critérios de aceitação. 3. Submeter para planejamento do backlog.";
            if (!string.IsNullOrWhiteSpace(guidelines))
            {
                action += $" (Observar diretrizes: {guidelines})";
            }
            return new TriageProposal(IssueCategory.Melhoria, summary, action);
        }

        return new TriageProposal(
            IssueCategory.Duvida,
            $"Esclarecimento de arquitetura, uso ou comportamento de '{title}'.",
            "1. Responder com referências à documentação do repositório. 2. Caso o questionamento revele necessidade de melhoria, criar issue filha."
        );
    }
}
