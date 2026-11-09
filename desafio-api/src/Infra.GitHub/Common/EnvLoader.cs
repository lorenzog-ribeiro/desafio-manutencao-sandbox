namespace SoftwareTriage.Infra.GitHub.Common;

public static class EnvLoader
{
    public static void Load()
    {
        var searchPaths = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), ".env"),
            Path.Combine(AppContext.BaseDirectory, ".env"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", ".env"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "..", ".env")
        };

        var envPath = searchPaths.FirstOrDefault(File.Exists);
        if (envPath is null) return;

        try
        {
            foreach (var line in File.ReadAllLines(envPath))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith('#'))
                    continue;

                var idx = trimmed.IndexOf('=');
                if (idx <= 0)
                    continue;

                var key = trimmed[..idx].Trim();
                var val = trimmed[(idx + 1)..].Trim();

                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                {
                    Environment.SetEnvironmentVariable(key, val);
                }
            }
        }
        catch
        {
            // Defensive: fail silently if unable to read .env
        }
    }
}
