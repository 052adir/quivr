"use client";

interface Zone { to: number; color: string } // `to` is a fraction 0..1

export function Gauge({
  value, max, label, display, zones,
}: {
  value: number; max: number; label: string; display: string;
  zones?: Zone[];
}) {
  const frac = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  const cx = 100, cy = 100, r = 82;
  const angle = 180 - frac * 180;
  const polar = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const z = zones ?? [
    { to: 0.5, color: "#dc2626" },
    { to: 0.8, color: "#d97706" },
    { to: 1, color: "#16a34a" },
  ];

  let prev = 0;
  const arcs = z.map((seg, i) => {
    const a0 = 180 - prev * 180;
    const a1 = 180 - seg.to * 180;
    const [x0, y0] = polar(a0);
    const [x1, y1] = polar(a1);
    prev = seg.to;
    return (
      <path key={i} d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`}
        fill="none" stroke={seg.color} strokeWidth={13} strokeLinecap="round" opacity={0.9} />
    );
  });

  const [nx, ny] = polar(angle);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 6 200 116" className="w-full max-w-[300px]">
        <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke="#eceef2" strokeWidth={13} strokeLinecap="round" />
        {arcs}
        <line x1={100} y1={100} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="#111827" strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={100} cy={100} r={6.5} fill="#111827" />
        <circle cx={100} cy={100} r={2.6} fill="#fff" />
      </svg>
      <div className="text-3xl font-extrabold -mt-3">{display}</div>
      <div className="text-sm font-semibold" style={{ color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}
