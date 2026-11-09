namespace SoftwareTriage.Core.Domain.ValueObjects;

public readonly record struct TriageJobId(Guid Value)
{
    public static TriageJobId New() => new(Guid.NewGuid());
    public static TriageJobId From(Guid value) => new(value);
    public override string ToString() => Value.ToString();

    public static implicit operator Guid(TriageJobId id) => id.Value;
    public static implicit operator TriageJobId(Guid value) => new(value);
}
