import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { GFREN_CHIPS } from '../lib/constants.js';
import { frenAnswer } from '../lib/data.js';
import { FrenMessages } from './FrenBits.jsx';

// Global "Ask fren" co-solver: a floating FAB that opens a docked chat.
export default function FrenDock() {
  const { report, active } = useApp();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [value, setValue] = useState('');
  const greeted = useRef(false);

  useEffect(() => {
    if (open && !greeted.current) {
      greeted.current = true;
      const id = setTimeout(
        () => setHistory((h) => [...h, { role: 'fren', text: "Hello — I'm fren, your co-solver. Ask me about any brand, the quality alerts, the approval queue, or the guardrails." }]),
        250
      );
      return () => clearTimeout(id);
    }
  }, [open]);

  const ask = (text) => {
    const t = text.trim();
    if (!t) return;
    setValue('');
    setHistory((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    const reply = frenAnswer(report, t);
    setTimeout(() => {
      setThinking(false);
      setHistory((h) => [...h, { role: 'fren', text: reply }]);
    }, 750);
  };

  const chips = GFREN_CHIPS[active] || GFREN_CHIPS.overview;

  if (!open) {
    return (
      <button className="fren-fab" onClick={() => setOpen(true)}>
        <span className="fab-av">f</span> Ask fren
      </button>
    );
  }

  return (
    <div className="fren-dock">
      <div className="fren-head">
        <div className="fren-avatar">f</div>
        <div><div className="fren-name">fren <span className="sub">· Co-solver</span></div></div>
        <div className="fren-live"><span className="d" /> Live</div>
        <span className="fren-dock-close" title="Close" onClick={() => setOpen(false)}>×</span>
      </div>
      <FrenMessages history={history} thinking={thinking} />
      {!thinking && (
        <div className="fren-chips-wrap">
          {chips.map((c) => (
            <button className="fren-chip" key={c} onClick={() => ask(c)}>{c}</button>
          ))}
        </div>
      )}
      <div className="fren-input-wrap">
        <textarea
          className="fren-input"
          rows={1}
          placeholder="Ask fren anything…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(value); } }}
        />
        <button className="fren-send" onClick={() => ask(value)}>→</button>
      </div>
    </div>
  );
}
