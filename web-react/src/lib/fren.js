// Shared fren answer path used by all three fren surfaces (global dock,
// copilot, intervention). Tries the backend LLM endpoint; on offline,
// scripted mode, or any error it returns the caller's local keyword answer —
// today's behaviour is the floor, never lost.
export async function askFren(question, { itemContext = null, fallback }) {
  try {
    const r = await fetch('/api/fren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, item_context: itemContext }),
    });
    if (r.ok) {
      const data = await r.json();
      if (!data.fallback && data.answer) return data.answer;
    }
  } catch {
    /* backend unreachable — standalone/offline demo */
  }
  return fallback();
}
