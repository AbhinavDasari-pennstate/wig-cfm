import { useEffect, useRef } from 'react';

// Scrollable message list shared by the dock, the copilot fren column, and the
// intervene panel. Auto-scrolls to the latest message.
export function FrenMessages({ history, thinking, frenLabel = 'fren · Co-solver' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [history, thinking]);
  return (
    <div className="fren-msgs" ref={ref}>
      {history.map((m, i) => (
        <div key={i} className={'fren-msg ' + (m.role === 'fren' ? 'fren-side' : 'user-side')}>
          <div className="fren-sender">{m.role === 'fren' ? frenLabel : 'You'}</div>
          <div className="fren-bubble">{m.text}</div>
        </div>
      ))}
      {thinking && (
        <div className="fren-thinking">
          <div className="thinking-dot" /><div className="thinking-dot" /><div className="thinking-dot" />
        </div>
      )}
    </div>
  );
}

// One-line autosizing-ish textarea + send button. Enter sends, Shift+Enter newlines.
export function FrenInput({ value, onChange, onSend, placeholder = 'Ask fren anything…', sendClass = '', inputRef }) {
  return (
    <div className="finput">
      <textarea
        ref={inputRef}
        className="fren-input"
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
      />
      <button className={'fsend ' + sendClass} onClick={onSend}>→</button>
    </div>
  );
}
