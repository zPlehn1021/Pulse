"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  data,
  width = 100,
  height = 30,
  color = "#6366f1",
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));

  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  // Fill area polygon (line + bottom corners)
  const fillPoints =
    `0,${height} ` +
    coords.map((c) => `${c.x},${c.y}`).join(" ") +
    ` ${width},${height}`;

  const gradientId = `spark-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  const last = coords[coords.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.0 }} />
        </linearGradient>
      </defs>

      {/* Gradient fill */}
      <polygon points={fillPoints} style={{ fill: `url(#${gradientId})` }} />

      {/* Line */}
      <polyline
        points={linePoints}
        style={{
          fill: "none",
          stroke: color,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
      />

      {/* Latest value dot */}
      <circle
        cx={last.x}
        cy={last.y}
        r={2.5}
        style={{ fill: color, filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}
