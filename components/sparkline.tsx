export function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const width = 84, height = 34;
  const min = Math.min(...data), max = Math.max(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / Math.max(max - min, 1)) * (height - 5) - 2}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" stroke={positive ? "#1fd58a" : "#ff5c72"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
