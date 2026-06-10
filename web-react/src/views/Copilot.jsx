import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { SKU_NAMES, FREN_SCRIPTS } from '../lib/constants.js';
import { isHighPriority } from '../lib/format.js';
import { timelineSteps, precedent, gapChecks, frenMatch, isArabic } from '../lib/copilot.js';
import { askFren } from '../lib/fren.js';
import { loadNote, saveNote } from '../lib/store.js';
import { FrenMessages, FrenInput } from '../components/FrenBits.jsx';

/* ─────────── shared modals ─────────── */
function ConfirmModal({ title, body, onCancel, onConfirm }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);
  return (
    <div className="cp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cp-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="cp-modal-btns">
          <button className="cp-modal-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="cp-modal-btn confirm" onClick={onConfirm}>Confirm →</button>
        </div>
      </div>
    </div>
  );
}

function GapCheckModal({ item, checks, onClose }) {
  const pass = checks.filter((c) => c.ok).length;
  const flagged = checks.length - pass;
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="gc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gc-modal" role="dialog" aria-modal="true" aria-label="Gap check">
        <div className="gc-h"><span style={{ color: 'var(--teal)' }}>⚑</span><span className="t">Gap Check · {item.workflow_task_id || ''}</span><span className="x" onClick={onClose}>×</span></div>
        <div className="gc-b">
          {checks.map((c, i) => (
            <div className="gc-row" key={i}>
              <span className={'gc-ic ' + (c.ok ? 'ok' : 'warn')}>{c.ok ? '✓' : '!'}</span>
              <div className="gc-tx"><div className="gt">{c.t}</div><div className="gs">{c.s}</div></div>
            </div>
          ))}
        </div>
        <div className="gc-f">✓ {pass} of {checks.length} checks pass{flagged ? ` · ${flagged} flagged for you` : ''}</div>
      </div>
    </div>
  );
}

/* ─────────── standard (procurement / warranty) copilot ─────────── */
function StandardCopilot({ item }) {
  const { report, closeCopilot, actionItem } = useApp();
  const isProc = item.type === 'PROCUREMENT_APPROVAL';
  const isHigh = isHighPriority(item);
  const name = isProc ? SKU_NAMES[item.sku] || item.sku : item.product || 'Warranty Claim';
  const script = FREN_SCRIPTS[isProc ? item.sku : item.brand || '_default'] || FREN_SCRIPTS._default;
  const prec = precedent(report, item, isProc);

  const [hist, setHist] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [frenInput, setFrenInput] = useState('');
  const [note, setNote] = useState(() => loadNote(item.workflow_task_id));
  const [gapOpen, setGapOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actioned, setActioned] = useState(!!item._actioned);
  const [docTool, setDocTool] = useState(isArabic(item.drafted_message || '') ? 'العربية' : 'English');
  const frenRef = useRef(null);
  const notesRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setHist((h) => (h.length ? h : [{ role: 'fren', text: script.open }])), 400);
    return () => clearTimeout(id);
  }, [script]);

  // PII-free item summary for the LLM: ids/SKU/value only — never the drafted
  // message, which contains the customer's name.
  const itemContext = isProc
    ? `Procurement approval ${item.workflow_task_id || ''}: SKU ${item.sku || '—'} (${name}), trigger ${(item.reason || '—').replace('_', ' ')}, store ${item.store || '—'}. Recommendation awaiting human buyer approval.`
    : `Warranty approval ${item.workflow_task_id || ''}: ${name}, declared value AED ${item.declared_value_aed}${isHigh ? ' (HIGH priority — above the AED 500 gate)' : ''}, warranty valid, reply drafted and awaiting desk release.`;

  const ask = async (text, scripted) => {
    const t = (text || '').trim();
    if (!t) return;
    setFrenInput('');
    setHist((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    if (scripted != null) {
      setTimeout(() => { setThinking(false); setHist((h) => [...h, { role: 'fren', text: scripted }]); }, 700);
      return;
    }
    const reply = await askFren(t, { itemContext, fallback: () => frenMatch(script.chips, t) });
    setThinking(false);
    setHist((h) => [...h, { role: 'fren', text: reply }]);
  };

  const desk = isProc ? 'Procurement Buyer Desk' : 'Warranty Desk';
  const doConfirm = () => {
    setConfirmOpen(false);
    const label = isProc ? 'Forwarded' : 'Released';
    actionItem(item.workflow_task_id, label);
    setActioned(true);
    setHist((h) => [...h, { role: 'fren', text: `Done — ${item.workflow_task_id || 'this item'} has been forwarded to ${desk}. They will review and action it. It is marked ${label.toLowerCase()} in the queue.` }]);
  };
  const submitLabel = isProc ? 'Forward to Buyer Desk →' : 'Release to Warranty Desk →';

  const tl = timelineSteps(item, isProc);
  const checks = gapChecks(item, isProc, isHigh);
  const msg = item.drafted_message || '—';
  const replyRTL = isArabic(msg);
  const ctxChips = [item.workflow_task_id || 'WF'];
  if (isProc) { if (item.sku) ctxChips.push(item.sku); if (item.reason) ctxChips.push(item.reason.replace('_', ' ').toLowerCase()); }
  else { ctxChips.push('AED ' + item.declared_value_aed + (isHigh ? ' · HIGH' : '')); ctxChips.push('warranty valid'); }
  if (prec) ctxChips.push(prec.count + ' precedents');

  const setNoteVal = (v) => { setNote(v); saveNote(item.workflow_task_id, v); };
  const onDocTool = (label) => {
    if (label === '✎ Edit' || label === 'Adjust tone') {
      setFrenInput(label === 'Adjust tone' ? 'Adjust the tone of this reply' : 'Help me edit this reply');
      frenRef.current?.focus();
      return;
    }
    setDocTool(label);
  };

  return (
    <div className="cp">
      <div className="cp-head">
        <span className="cp-back" onClick={closeCopilot}>◁ Queue</span>
        <div className="cp-crumb"><span>Queue</span><span className="sep">›</span><span>{item.workflow_task_id || '—'}</span><span className="sep">›</span><span className="cur">{isProc ? 'Procurement' : 'Warranty'} · Review</span></div>
        <div className="cp-actions">
          <div className="cpb" onClick={() => frenRef.current?.focus()}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} /> fren assisted</div>
          <div className="cpb" onClick={() => notesRef.current?.focus()}>◷ Notes {note.trim() && <span className="ct">1</span>}</div>
          <div className="cpb" onClick={() => setGapOpen(true)}>⚑ Gap Check</div>
          <div className="cpb primary" onClick={() => (actioned ? null : setConfirmOpen(true))} style={actioned ? { opacity: 0.7 } : undefined}>{actioned ? '✓ ' + item._actionLabel : submitLabel}</div>
        </div>
      </div>

      {/* ctx column */}
      <div className="col col-ctx">
        <div className="ck">◷ Case timeline</div>
        <div className="ctx-card">
          <div className="tl">
            {tl.map((s, i) => (
              <div className={'tl-step' + (s.now ? ' now' : '')} key={i}><div className="tl-when">{s.when}</div><div className="tl-what">{s.what}</div><div className="tl-agent">{s.agent}</div></div>
            ))}
          </div>
        </div>

        <div className="ck">⚖ Policy &amp; precedent</div>
        <div className="ctx-card">
          {isProc ? (
            <>
              <div className="ctx-title">Procurement context</div>
              <div className="kv"><span className="k">Shelf stock</span><span className="v">0</span></div>
              <div className="kv"><span className="k">Backroom</span><span className="v">0</span></div>
              <div className="kv"><span className="k">Store</span><span className="v">{item.store || '—'}</span></div>
              <div className="kv"><span className="k">Trigger</span><span className="v">{(item.reason || '—').replace('_', ' ')}</span></div>
            </>
          ) : (
            <>
              <div className="ctx-title">Warranty policy</div>
              <div className="kv"><span className="k">Coverage</span><span className="v">1-year standard</span></div>
              <div className="kv"><span className="k">Window</span><span className="v">Valid</span></div>
              <div className="kv"><span className="k">High-value gate</span><span className="v">&gt; AED 500</span></div>
              <div className="kv"><span className="k">This claim</span><span className="v">AED {item.declared_value_aed} {isHigh ? '→ HIGH' : '→ standard'}</span></div>
            </>
          )}
          {prec && (
            <div className="prec">◆ <span>{prec.hasCat ? <><b>{prec.catCount} similar {prec.brand} {prec.label} case{prec.catCount !== 1 ? 's' : ''}</b> on record · {prec.resolved} resolved.</> : <><b>{prec.total} {prec.brand} case{prec.total !== 1 ? 's' : ''}</b> on record · {prec.resolved} resolved. No prior on this exact issue.</>}</span></div>
          )}
        </div>

        <div className="ck">◷ Your notes</div>
        <div className="ctx-card">
          <textarea ref={notesRef} className="notes-area" placeholder="Add a note for the desk…" value={note} onChange={(e) => setNoteVal(e.target.value)} />
          <div className="notes-saved" style={{ display: note.trim() ? 'flex' : 'none' }}>✓ Saved on this device</div>
        </div>
      </div>

      {/* doc column */}
      <div className="col col-doc">
        <div className="doc-head">
          <div className="doc-pl"><span className="dot" /> Live preview {isHigh && <span className="doc-flag">⚑ High priority</span>} <span className="doc-status">Recommendation drafted</span></div>
        </div>
        <div className="doc-scroll">
          <div className="doc-body">
            <div className="doc-sec">
              <div className="doc-sec-t">{isProc ? 'Procurement recommendation' : 'Warranty fulfilment approval'} · <span className="mono" style={{ fontWeight: 400, color: 'var(--faint)' }}>{item.workflow_task_id || '—'}</span></div>
              {(isProc
                ? [['SKU', item.sku || '—'], ['Product', name], ['Store', item.store || '—'], ['Trigger', (item.reason || '—').replace('_', ' ')]]
                : [['Claim ID', item.claim_id || '—'], ['Product', name], ['Declared value', `AED ${item.declared_value_aed}${isHigh ? ' HIGH' : ''}`], ['Warranty', 'Valid'], ['Assigned to', item.assigned_to || 'Warranty Desk']]
              ).map(([k, v], i) => (
                <div className="doc-kv" key={i}><span className="k">{k}</span><span className="v">{v}{!isProc && k === 'Declared value' && isHigh && <span className="badge blood" style={{ marginLeft: 6 }}>HIGH</span>}</span></div>
              ))}
            </div>

            <div className="doc-sec">
              <div className="doc-sec-t">{isProc ? 'Agent recommendation' : 'Drafted reply · Agent 2'}</div>
              {isProc ? (
                <div className="reply">{item.recommendation || '—'}</div>
              ) : (
                <>
                  <div className="reply-tools">
                    {(replyRTL ? ['العربية', 'English', '✎ Edit', 'Adjust tone'] : ['English', '✎ Edit', 'Adjust tone']).map((rt) => (
                      <span key={rt} className={'rtool' + (docTool === rt ? ' active' : '')} onClick={() => onDocTool(rt)}>{rt}</span>
                    ))}
                  </div>
                  <div className="reply" dir={replyRTL ? 'rtl' : undefined} style={replyRTL ? { fontFamily: 'var(--ar)' } : undefined}>{msg}</div>
                </>
              )}
            </div>

            <div className="doc-sec">
              <div className="doc-sec-t">On {isProc ? 'forward' : 'release'} · what happens next</div>
              <div className="flow">
                <div className="flow-step"><div className="n">1 · {isProc ? 'Desk' : 'Customer'}</div><div className="ft">{isProc ? 'Buyer Desk reviews' : 'Customer receives the reply'}</div><div className="fs">{isProc ? 'human decides on the PO' : 'once the desk signs off'}</div></div>
                <div className="flow-step"><div className="n">2 · Survey</div><div className="ft">CSAT / NPS / CES sent</div><div className="fs">satisfaction survey follows resolution</div></div>
                <div className="flow-step"><div className="n">3 · SAP</div><div className="ft">Resolution written back</div><div className="fs">scores + notes → CRM · agents don't own the data</div></div>
              </div>
            </div>
          </div>
        </div>
        <div className="doc-foot">
          <span className="fnote">{isProc ? "Forwarding notifies the Buyer Desk. You're proposing — not transacting." : `Releasing notifies the Warranty Desk to action ${item.claim_id || 'this claim'}. You're proposing — not transacting.`}</span>
          <button className="foot-btn" onClick={() => (actioned ? null : setConfirmOpen(true))} style={actioned ? { opacity: 0.7 } : undefined}>{actioned ? '✓ ' + item._actionLabel : submitLabel}</button>
        </div>
      </div>

      {/* fren column */}
      <div className="col col-fren">
        <div className="fren-head"><div className="fren-avatar">f</div><div><div className="fren-name">fren <span className="sub">· Co-solver</span></div></div><div className="fren-live"><span className="d" /> Live</div></div>
        <div className="fren-ctx">{ctxChips.map((c, i) => <span className="ctxchip" key={i}>{c}</span>)}</div>
        <FrenMessages history={hist} thinking={thinking} />
        {!thinking && (
          <div className="fchips">
            <div className="fchips-label">Suggested</div>
            <div>{script.chips.map((c, i) => <button className="fren-chip" key={i} onClick={() => ask(c.q, c.a)}>{c.q}</button>)}</div>
          </div>
        )}
        <FrenInput value={frenInput} onChange={setFrenInput} onSend={() => ask(frenInput)} inputRef={frenRef} />
      </div>

      {gapOpen && <GapCheckModal item={item} checks={checks} onClose={() => setGapOpen(false)} />}
      {confirmOpen && (
        <ConfirmModal
          title={isProc ? 'Forward to Buyer Desk' : 'Release to Warranty Desk'}
          body={<>This will notify <strong>{desk}</strong> to action {item.workflow_task_id || 'this item'}. You are <strong>proposing</strong> — not transacting. A person at the desk will make the final decision.</>}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doConfirm}
        />
      )}
    </div>
  );
}

/* ─────────── intervention copilot variant ─────────── */
function InterventionCopilot({ item }) {
  const { report, closeCopilot, openRun, actionItem } = useApp();
  const [hist, setHist] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [frenInput, setFrenInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actioned, setActioned] = useState(!!item._actioned);

  const chips = [
    { q: 'Is this safe to apply?', a: 'Yes — applying only notifies ' + item.assigned_to + ' to action your requested change. No purchase, dispatch, or customer message is sent automatically. A person signs off.' },
    { q: 'What did the human ask for?', a: 'The request was: "' + item.request + '". I drafted a proposal for the desk to review.' },
    { q: 'Will the customer be re-contacted?', a: "Not automatically. Any new customer message would itself be drafted and approved before sending — propose, don't transact." },
  ];

  useEffect(() => {
    const id = setTimeout(() => setHist((h) => (h.length ? h : [{ role: 'fren', text: 'This is a human-requested change to "' + item.source_title + '". Review the draft on the left; Apply routes it to ' + item.assigned_to + ' for sign-off.' }])), 400);
    return () => clearTimeout(id);
  }, [item]);

  const itemContext = `Human intervention ${item.workflow_task_id}: operator requested "${item.request}" on run "${item.source_title}", assigned to ${item.assigned_to}, drafted and awaiting apply/release.`;

  const ask = async (text, scripted) => {
    const t = (text || '').trim();
    if (!t) return;
    setFrenInput('');
    setHist((h) => [...h, { role: 'user', text: t }]);
    setThinking(true);
    if (scripted != null) {
      setTimeout(() => { setThinking(false); setHist((h) => [...h, { role: 'fren', text: scripted }]); }, 700);
      return;
    }
    const reply = await askFren(t, { itemContext, fallback: () => frenMatch(chips, t) });
    setThinking(false);
    setHist((h) => [...h, { role: 'fren', text: reply }]);
  };

  const goRun = () => { const sc = (report.scenarios || []).find((s) => s.id === item.source_run); if (sc) { closeCopilot(); openRun(sc); } };
  const doConfirm = () => {
    setConfirmOpen(false);
    actionItem(item.workflow_task_id, 'Applied');
    setActioned(true);
    setHist((h) => [...h, { role: 'fren', text: 'Done — ' + item.workflow_task_id + ' has been released to ' + item.assigned_to + '. They will review and action it. It is marked applied in the queue.' }]);
  };
  const msg = item.drafted_message || '—';
  const ar = isArabic(msg);

  return (
    <div className="cp">
      <div className="cp-head">
        <span className="cp-back" onClick={closeCopilot}>◁ Queue</span>
        <div className="cp-crumb"><span>Queue</span><span className="sep">›</span><span>{item.workflow_task_id}</span><span className="sep">›</span><span className="cur">Intervention · Review</span></div>
        <div className="cp-actions">
          <div className="cpb" onClick={goRun}>◷ Open source run</div>
          <div className="cpb primary" onClick={() => (actioned ? null : setConfirmOpen(true))} style={actioned ? { opacity: 0.7 } : undefined}>{actioned ? '✓ Applied' : 'Apply / Release →'}</div>
        </div>
      </div>

      <div className="col col-ctx">
        <div className="ck">↩ Source run</div>
        <div className="ctx-card">
          <div className="ctx-title">Reopened run</div>
          <div className="kv"><span className="k">Run</span><span className="v">{item.source_title}</span></div>
          <div className="kv"><span className="k">Assigned</span><span className="v">{item.assigned_to}</span></div>
          <div className="prec" style={{ cursor: 'pointer' }} onClick={goRun}>◷ open run</div>
        </div>
        <div className="ck">◷ What happened</div>
        <div className="ctx-card">
          <div className="tl">
            {[{ what: 'Human intervened', agent: item.kind }, { what: 'Agent drafted change', agent: 'no message sent' }, { what: 'Awaiting approval', agent: 'nothing dispatched yet', now: true }].map((s, i) => (
              <div className={'tl-step' + (s.now ? ' now' : '')} key={i}><div className="tl-when">now</div><div className="tl-what">{s.what}</div><div className="tl-agent">{s.agent}</div></div>
            ))}
          </div>
        </div>
        <div className="ck">✎ Your request</div>
        <div className="ctx-card"><div className="reply" style={{ fontSize: '13px' }}>{item.request}</div></div>
      </div>

      <div className="col col-doc">
        <div className="doc-head"><div className="doc-pl"><span className="dot" /> Human intervention · {item.kind} <span className="doc-status">Drafted</span></div></div>
        <div className="doc-scroll">
          <div className="doc-body">
            <div className="doc-sec">
              <div className="doc-sec-t">Drafted change · {item.workflow_task_id}</div>
              <div className="reply" dir={ar ? 'rtl' : undefined} style={ar ? { fontFamily: 'var(--ar)' } : undefined}>{msg}</div>
            </div>
            <div className="doc-sec">
              <div className="doc-sec-t">On apply · what happens next</div>
              <div className="flow">
                <div className="flow-step"><div className="n">1 · Desk</div><div className="ft">{item.assigned_to} reviews</div><div className="fs">a person actions the change</div></div>
                <div className="flow-step"><div className="n">2 · Run</div><div className="ft">Linked run updated</div><div className="fs">intervention recorded on the trace</div></div>
                <div className="flow-step"><div className="n">3 · SAP</div><div className="ft">Outcome written back</div><div className="fs">agents record — never own the data</div></div>
              </div>
            </div>
          </div>
        </div>
        <div className="doc-foot">
          <span className="fnote">Applying notifies {item.assigned_to}. You're proposing — not transacting.</span>
          <button className="foot-btn" onClick={() => (actioned ? null : setConfirmOpen(true))} style={actioned ? { opacity: 0.7 } : undefined}>{actioned ? '✓ Applied' : 'Apply / Release →'}</button>
        </div>
      </div>

      <div className="col col-fren">
        <div className="fren-head"><div className="fren-avatar">f</div><div><div className="fren-name">fren <span className="sub">· Co-solver</span></div></div><div className="fren-live"><span className="d" /> Live</div></div>
        <div className="fren-ctx">{[item.workflow_task_id, 'intervention', item.assigned_to].map((c, i) => <span className="ctxchip" key={i}>{c}</span>)}</div>
        <FrenMessages history={hist} thinking={thinking} />
        {!thinking && (
          <div className="fchips">
            <div className="fchips-label">Suggested</div>
            <div>{chips.map((c, i) => <button className="fren-chip" key={i} onClick={() => ask(c.q, c.a)}>{c.q}</button>)}</div>
          </div>
        )}
        <FrenInput value={frenInput} onChange={setFrenInput} onSend={() => ask(frenInput)} />
      </div>

      {confirmOpen && (
        <ConfirmModal
          title="Apply intervention"
          body={<>This will notify <strong>{item.assigned_to}</strong> to action {item.workflow_task_id}. You are <strong>proposing</strong> — not transacting. A person at the desk makes the final decision.</>}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doConfirm}
        />
      )}
    </div>
  );
}

export default function Copilot({ item }) {
  return item.type === 'INTERVENTION' ? <InterventionCopilot item={item} /> : <StandardCopilot item={item} />;
}
