import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { agentNums, outcomeFor, channelLabel, langLabel, isRTLLang } from '../lib/format.js';
import { FrenMessages, FrenInput } from '../components/FrenBits.jsx';

/* ── trace helpers ── */
function TraceStage({ stage }) {
  const human = /human/i.test(stage.agent);
  return (
    <div className={'rv-stage' + (human ? ' human' : '')}>
      <div className="rv-stage-agent">{stage.agent}</div>
      <div className="rv-steps">
        {(stage.steps || []).map((step, i) => {
          const warn = String(step.label).startsWith('⚠') || String(step.label).startsWith('🔴');
          return (
            <div className="rv-step" key={i}>
              <span className="rv-step-lbl" style={warn ? { color: 'var(--blood)' } : undefined}>{step.label}</span>
              <span className="rv-step-body">
                {step.tool && <span className={'rv-tool ' + (step.tool === 'safety' ? 'safety' : '')}>{step.tool}</span>}
                {step.detail || ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Prefer structured scores from the backend; fall back to scanning the trace
// text (legacy reports), tolerating decimals and multi-digit values.
function parseScores(sc, stages) {
  if (sc.scores && (sc.scores.csat != null || sc.scores.nps != null || sc.scores.ces != null)) {
    return { csat: sc.scores.csat ?? null, nps: sc.scores.nps ?? null, ces: sc.scores.ces ?? null };
  }
  let blob = '';
  (stages || []).forEach((st) => (st.steps || []).forEach((s) => { blob += ' ' + (s.detail || ''); }));
  const csat = blob.match(/CSAT\s*(\d+(?:\.\d+)?)/i);
  const nps = blob.match(/NPS\s*([+-]?\d+)/i);
  const ces = blob.match(/CES\s*(\d+(?:\.\d+)?)/i);
  if (!csat && !nps && !ces) return null;
  return { csat: csat ? csat[1] : null, nps: nps ? nps[1] : null, ces: ces ? ces[1] : null };
}

/* ── intervene helpers ── */
function interveneChips(sc) {
  const nums = agentNums(sc.stages);
  const blob = (sc.title + ' ' + (sc.tagline || '')).toLowerCase();
  if (nums.includes('5') || /procure|reorder|stock|supplier/.test(blob))
    return ['Adjust order quantity', 'Hold the reorder', 'Switch supplier', 'Escalate to category manager'];
  if (/safety|injection|manipulat|contained|block/.test(blob))
    return ['Add to block-list review', 'Notify security'];
  if (nums.includes('2') || /warrant|return|refund|replace/.test(blob))
    return ['Redo the reply — warmer tone', 'Reclassify (not WARRANTY_RETURN)', 'Also flag to the quality team', 'Add a goodwill gesture proposal'];
  return ['Redo the reply', 'Add a follow-up action', 'Escalate to a manager', 'Flag to the quality team'];
}
function deskForKind(kind) {
  const k = (kind || '').toLowerCase();
  if (/quant|reorder|supplier|category|order|hold/.test(k)) return 'Procurement Buyer Desk';
  if (/security|block-list|block list/.test(k)) return 'Trust & Safety';
  if (/quality/.test(k)) return 'Quality Review';
  return 'Warranty Desk';
}
const draftForKind = (sc, kind) =>
  `Drafted at your request: "${kind}". A revised proposal for ${sc.title} has been prepared for the ${deskForKind(kind)} to review and action. Nothing has been re-sent to the customer.`;

export default function RunView({ sc }) {
  const { closeRun, rvFrenOpen, setRvFrenOpen, toast, intervene } = useApp();
  const stages = sc.stages || [];          // sc updates immutably via the store
  const reopened = !!sc._reopened;
  const [hist, setHist] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState('');

  const out = outcomeFor(sc);
  const nums = agentNums(stages);
  const lang = sc.input ? sc.input.lang : '—';
  const ch = sc.channel ? sc.channel.split(' ')[0] : '—';

  useEffect(() => {
    if (rvFrenOpen && hist.length === 0) {
      const id = setTimeout(() => setHist([{ role: 'fren', text: "What should change about this run? Pick a request or describe it — I'll draft it and route it to the Human Queue for sign-off." }]), 300);
      return () => clearTimeout(id);
    }
  }, [rvFrenOpen, hist.length]);

  const submit = (raw) => {
    const text = (raw || '').trim();
    if (!text) return;
    setInput('');
    setHist((h) => [...h, { role: 'user', text }]);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const desk = deskForKind(text);
      const draft = draftForKind(sc, text);
      intervene(sc.id, text, draft, desk);
      setHist((h) => [...h, { role: 'fren', text: draft + " I've added it to the Human Queue — open it there to approve." }]);
      toast('Proposal added to the Human Queue · linked to this run.');
    }, 800);
  };

  const sr = parseScores(sc, stages);
  const isRTL = isRTLLang(lang);

  return (
    <div className={'rv' + (rvFrenOpen ? ' fren-open' : '')}>
      <div className="rv-head">
        <span className="cp-back" onClick={closeRun}>◁ Runs</span>
        <div className="rv-htitle">
          <span className="rv-name">{sc.title}</span>
          <span className={'outcome ' + out.cls}>{out.label}</span>
          {reopened && <span className="rv-reopened">⟲ reopened</span>}
        </div>
        <div className="rv-hmeta">
          <div className="agent-pills">{nums.map((n) => <span key={n} className={'a-pill a' + n}>Agent {n}</span>)}</div>
          <span className="rv-chan">{channelLabel(ch)} · {langLabel(lang)}</span>
        </div>
        <div className="rv-actions">
          <button className={'rv-iv' + (rvFrenOpen ? ' on' : '')} onClick={() => setRvFrenOpen(!rvFrenOpen)}>⚑ Intervene</button>
        </div>
      </div>

      <div className="rv-grid">
        <div className="rv-trace">
          <div className="rv-colk">◷ Agent trace</div>
          <div className="rv-thread">{stages.map((stage, i) => <TraceStage key={i} stage={stage} />)}</div>
        </div>

        <div className="rv-art">
          {sr && (
            <>
              <div className="rv-colk">◆ Resolution scores</div>
              <div className="rv-scores">
                <div className="rv-score"><div className="k">CSAT</div><div className="v">{sr.csat ?? '—'}</div></div>
                <div className="rv-score"><div className="k">NPS</div><div className="v">{sr.nps != null ? (+sr.nps > 0 ? '+' : '') + sr.nps : '—'}</div></div>
                <div className="rv-score"><div className="k">CES</div><div className="v">{sr.ces ?? '—'}</div></div>
              </div>
            </>
          )}
          {sc.input && sc.input.text && (
            <>
              <div className="rv-colk">✉ Inbound</div>
              <div className="msg-block">
                <div className="lang">{sc.input.customer || '—'} · {langLabel(lang)}</div>
                <div className="msg-body" dir={isRTL ? 'rtl' : undefined}>{sc.input.text}</div>
              </div>
            </>
          )}
          {sc.messages && sc.messages.length > 0 && (
            <>
              <div className="rv-colk">✎ Messages</div>
              {sc.messages.map((m, i) => (
                <div className="msg-block" key={i}>
                  <div className="lang">{m.label} · {langLabel(m.language)}</div>
                  <div className="msg-body" dir={m.language === 'ARABIC' ? 'rtl' : undefined}>{m.text || '—'}</div>
                </div>
              ))}
            </>
          )}
          {sc.edge && (
            <div className="edge-quote"><div className="q">"{sc.edge}"</div><div className="src">Why it wins</div></div>
          )}
        </div>

        {rvFrenOpen && (
          <div className="rv-fren">
            <div className="fren-head rv-fren-head">
              <div className="fren-avatar brass">f</div>
              <div><div className="fren-name">fren <span className="sub">· Intervention</span></div></div>
              <div className="fren-live brass"><span className="d" /> Drafting</div>
            </div>
            <div className="rv-iv-banner">You're reviewing a closed run. Anything you request is drafted and sent to the Human Queue for approval — nothing is re-sent automatically.</div>
            <FrenMessages history={hist} thinking={thinking} frenLabel="fren · Intervention" />
            {!thinking && (
              <div className="fchips">
                <div className="fchips-label">Request a change</div>
                <div>{interveneChips(sc).map((c) => <button className="fren-chip" key={c} onClick={() => submit(c)}>{c}</button>)}</div>
              </div>
            )}
            <FrenInput value={input} onChange={setInput} onSend={() => submit(input)} placeholder="Describe what else should happen…" sendClass="brass" />
          </div>
        )}
      </div>
    </div>
  );
}
