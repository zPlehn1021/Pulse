"use client";

interface ArcGaugeProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  info?: React.ReactNode;
}

export function ArcGauge({
  value,
  size = 120,
  strokeWidth = 10,
  color = "#6366f1",
  label,
  sublabel,
  info,
}: ArcGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  // Needle angle: 0% = -180°, 100% = 0° (sweeps left to right)
  const needleAngle = -180 + (clamped / 100) * 180;
  const needleLength = radius;
  const cx = size / 2;
  const cy = size / 2;
  const needleRad = (needleAngle * Math.PI) / 180;
  const nx = cx + Math.cos(needleRad) * needleLength;
  const ny = cy + Math.sin(needleRad) * needleLength;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size / 2 + strokeWidth}
        viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}
      >
        <defs>
          <filter id={`glow-${label ?? "arc"}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          style={{
            stroke: "var(--surface-3)",
            strokeWidth,
            strokeLinecap: "round",
          }}
        />

        {/* Value arc */}
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          className="transition-all duration-700 ease-out"
          style={{
            stroke: color,
            strokeWidth,
            strokeLinecap: "round",
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            filter: `drop-shadow(0 0 4px ${color}40)`,
          }}
        />

        {/* Animated needle dot */}
        <circle
          cx={nx}
          cy={ny}
          r={strokeWidth * 0.35}
          className="transition-all duration-700 ease-out"
          style={{ fill: "white", filter: `drop-shadow(0 0 3px ${color})` }}
        />

        {/* Value text */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          style={{
            fill: "var(--text-primary)",
            fontSize: size * 0.22,
            fontFamily: "var(--font-jetbrains-mono)",
            fontWeight: 700,
          }}
        >
          {Math.round(clamped)}
        </text>
      </svg>
      {label && (
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          {label}
          {info}
        </span>
      )}
      {sublabel && (
        <span className="text-[10px] text-zinc-600">{sublabel}</span>
      )}
    </div>
  );
}
