// Gráfico de linha em SVG puro (sem dependências). Valores nulos quebram a linha (lacuna), nunca viram zero.
export function LineChart({ data, label, format, color = "#243B80" }: { data: { date: string; value: number | null }[]; label: string; format: (v: number) => string; color?: string }) {
  const W = 380, H = 150, PX = 52, PY = 14;
  const vals = data.map((d) => d.value).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="py-10 text-center text-sm text-muted">Sem dados no período.</p>;
  const max = Math.max(...vals) || 1;
  const x = (i: number) => PX + (data.length === 1 ? (W - PX) / 2 : (i * (W - PX - 8)) / (data.length - 1));
  const y = (v: number) => H - PY - (v / max) * (H - PY * 2);
  let path = "";
  let pen = false;
  data.forEach((d, i) => {
    if (d.value === null) { pen = false; return; }
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)} `;
    pen = true;
  });
  const ticks = [0, 0.5, 1];
  const first = data[0].date.slice(5).split("-").reverse().join("/");
  const last = data.at(-1)!.date.slice(5).split("-").reverse().join("/");
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${label}: de ${first} a ${last}, máximo ${format(max)}, soma ${format(total)}`} className="w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PX} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="#E4E8F0" />
            <text x={PX - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#69738A" className="num">{format(max * t)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {data.length <= 45 && data.map((d, i) => d.value !== null && <circle key={d.date} cx={x(i)} cy={y(d.value)} r="2" fill={color}><title>{`${d.date}: ${format(d.value)}`}</title></circle>)}
        <text x={PX} y={H + 12} fontSize="11" fill="#69738A">{first}</text>
        <text x={W} y={H + 12} textAnchor="end" fontSize="11" fill="#69738A">{last}</text>
      </svg>
    </figure>
  );
}
