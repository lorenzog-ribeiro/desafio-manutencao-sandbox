using System.Text.Json.Serialization;

namespace SoftwareTriage.Infra.GitHub.Ai.Harness;

public sealed record AiTriageResultModel(
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("problemSummary")] string ProblemSummary,
    [property: JsonPropertyName("suggestedAction")] string SuggestedAction,
    [property: JsonPropertyName("requiresHumanReview")] bool RequiresHumanReview,
    [property: JsonPropertyName("confidenceScore")] double? ConfidenceScore,
    [property: JsonPropertyName("missingInformation")] string? MissingInformation
);
