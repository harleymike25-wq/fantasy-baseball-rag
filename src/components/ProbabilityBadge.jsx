export default function ProbabilityBadge({ score }) {
  if (!score) return null;

  const color =
    score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "START" : score >= 45 ? "NEUTRAL" : "SIT";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: color + "22",
        border: `1px solid ${color}`,
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "12px",
        fontWeight: 700,
        color,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label} {score}/100
    </span>
  );
}
