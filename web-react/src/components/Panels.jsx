import { channelLabel } from '../lib/format.js';

// SVG sparkline: 7-day volume bars + NPS line. Ported from buildTrendPanel.
export function TrendPanel({ daily }) {
  const W = 320, H = 96, padL = 4, padR = 4, base = H - 16, topPad = 10;
  const maxV = Math.max(...daily.map((d) => d.volume), 1);
  const npsv = daily.map((d) => d.nps);
  const minN = Math.min(...npsv, 0), maxN = Math.max(...npsv, 1);
  const spanN = maxN - minN || 1;
  const n = daily.length;
  const slot = (W - padL - padR) / n;

  const bars = daily.map((d, i) => {
    const h = (d.volume / maxV) * (base - topPad);
    const x = padL + i * slot + slot * 0.2;
    const w = slot * 0.6;
    const y = base - h;
    return <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width={w.toFixed(1)} height={h.toFixed(1)} rx="2" fill="var(--teal-soft)" stroke="#C8DDD9" strokeWidth="1" />;
  });
  const pts = daily.map((d, i) => {
    const x = padL + i * slot + slot / 2;
    const y = topPad + (1 - (d.nps - minN) / spanN) * (base - topPad);
    return [x, y];
  });
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Feedback · last 7 days</span>
        <div className="panel-legend">
          <span className="lg"><span className="sw" style={{ background: 'var(--teal-soft)', border: '1px solid #C8DDD9' }} />Volume</span>
          <span className="lg"><span className="sw line" style={{ background: 'var(--ink)' }} />NPS</span>
        </div>
      </div>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line className="gl" x1="0" y1={base} x2={W} y2={base} />
        {bars}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="2.4" fill="var(--ink)" />)}
      </svg>
      <div className="spark-x">{daily.map((d, i) => <span key={i}>{d.label}</span>)}</div>
    </div>
  );
}

export function ChannelPanel({ mix }) {
  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Channel mix</span>
        <span className="panel-legend" style={{ color: 'var(--faint)' }}>{total} tickets</span>
      </div>
      <div className="chan-list">
        {entries.map(([name, v], i) => (
          <div className="chan-item" key={name}>
            <span className="chan-name">{channelLabel(name)}</span>
            <div className="chan-track"><div className={'chan-fill c' + ((i % 4) + 1)} style={{ width: Math.round((v / max) * 100) + '%' }} /></div>
            <span className="chan-val">{Math.round((v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
