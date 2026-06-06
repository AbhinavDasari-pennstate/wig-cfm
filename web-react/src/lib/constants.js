// Static scripted data, ported verbatim from the legacy single-file dashboard.

export const SKU_NAMES = {
  'RF-AF250': 'Royalford 2.5L Air Fryer', 'DC-PAN20': 'Delcasa 20cm Non-Stick Pan',
  'RF-BL100': 'Royalford Glass Blender', 'KT-IRON21': 'Krypton Steam Iron KT-IRON21',
  'GF-1234': 'GEEPAS Glass Blender GF-1234', 'GK-NEW': 'GEEPAS Electric Kettle GK-NEW',
};

export const BRAND_REGIONS = {
  GEEPAS: 'Dubai', NESTO: 'Sharjah', ROYALFORD: 'Abu Dhabi',
  PARAJOHN: 'Dubai Marina', KRYPTON: 'Abu Dhabi', OLSENMARK: 'Sharjah', DELCASA: 'Dubai',
};

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', dot: '#B8893B', badge: null },
  { key: 'quality', label: 'Quality Alerts', dot: '#A8412A', badge: 'alerts' },
  { key: 'queue', label: 'Human Queue', dot: '#B8893B', badge: 'queue' },
  { key: 'runs', label: 'Agent Runs', dot: '#0E6E64', badge: null },
  { key: 'guardrails', label: 'Guardrails', dot: '#0E6E64', badge: null },
  { key: 'loop', label: 'Closed Loop', dot: '#1F7A5A', badge: null },
];

export const RUN_TIMES = ['06:00', '06:14', '06:15', '06:15', '06:16', '06:17'];

export const OUTCOMES = {
  warranty_arabic: { label: 'RESOLVED', cls: 'resolved' },
  oos_recommend: { label: 'PENDING', cls: 'pending' },
  manipulation: { label: 'CONTAINED', cls: 'contained' },
  velocity_digest: { label: 'RESOLVED', cls: 'resolved' },
  coaching_hindi: { label: 'ESCALATED', cls: 'escalated' },
  hitl_safety: { label: 'ESCALATED', cls: 'escalated' },
};

export const FREN_SCRIPTS = {
  'RF-AF250': {
    open: "I've reviewed WF for Royalford 2.5L Air Fryer at NESTO Dubai. Stock is at zero with no open PO. Purchase history shows a regular 14-day reorder cycle across 3 previous orders. The recommendation looks solid — awaiting your decision.",
    chips: [
      { q: 'Check alternative supplier', a: 'The last 3 POs used the same supplier at consistent pricing (AED 18/unit). No alternative is on record. You may want to confirm current pricing directly before forwarding.' },
      { q: 'Adjust order quantity', a: 'Current cadence is 12 units every 14.5 days. Given zero stock, consider 18 units to build a small buffer. Estimated AED 324 at the same unit price.' },
      { q: "What's the delay risk?", a: 'No open PO and 0 backroom stock means the shelf stays empty until a new order is approved. Customer complaint volume on RF-AF250 is rising — one complaint already in the queue.' },
      { q: 'Summarise for manager', a: 'RF-AF250 is out of stock at NESTO Dubai. Regular supplier, AED 216 for 12 units, 14-day cadence. Recommend forwarding for approval today to avoid stockout escalation.' },
    ],
  },
  'DC-PAN20': {
    open: "I've loaded the DC-PAN20 item — PO-778412 with DELCASA-DIST-01 is 3 days past its expected delivery date. This is a Case 2 situation: stock is expected but delayed. Supplier contact is the immediate action needed.",
    chips: [
      { q: 'Draft supplier chase message', a: "Suggested: 'PO-778412 for DC-PAN20 is 3 days past expected delivery at NESTO Dubai Festival City. Please provide an updated ETA and confirm shipment status. If delivery is not possible within 48 hours, we will initiate an emergency reorder.'" },
      { q: 'Should I initiate emergency reorder?', a: "Only if the supplier cannot confirm delivery within 48 hours. An emergency reorder may carry a price premium. I'd recommend contacting the supplier first and setting a firm deadline before escalating." },
      { q: "What's the stock impact?", a: 'Zero shelf stock and zero backroom. Every day of delay is a missed sale and potential customer complaint. NESTO store manager has already been notified by Agent 5.' },
      { q: 'Summarise for manager', a: 'DC-PAN20 open PO is 3 days overdue. Supplier is DELCASA-DIST-01, PO-778412. Recommend urgent supplier contact. If no resolution in 48h, escalate to emergency procurement.' },
    ],
  },
  'KT-IRON21': {
    open: "This one needs immediate attention. KT-IRON21 is a new SKU with 4 quality complaints in 3 days — no prior baseline. The velocity spike triggered a quality alert. I'd recommend pausing further procurement pending quality investigation.",
    chips: [
      { q: 'How serious is the velocity spike?', a: '4 complaints in 3 days on a new product with no history is a significant early-warning signal. Agent 3 flagged it because any cluster on a new SKU counts as a spike — there\'s no baseline to compare against.' },
      { q: 'Who should investigate the quality issue?', a: 'The product team should review the complaints first. All 4 are PRODUCT_QUALITY category. Consider reaching out to the brand manager for KRYPTON and requesting a product inspection report.' },
      { q: 'Should I pause the reorder?', a: "Yes — I'd recommend pausing until the quality investigation concludes. If the issue is a manufacturing defect, ordering more units before it's resolved would compound the problem." },
      { q: 'Summarise for manager', a: 'KRYPTON KT-IRON21 (new SKU) has 4 quality complaints in 3 days. Velocity alert raised. Recommend: pause procurement, notify product team, initiate quality investigation. No order to place — propose only.' },
    ],
  },
  GEEPAS: {
    open: "I've loaded the GEEPAS Glass Blender warranty claim. The warranty is valid (ends Jan 2027), declared value is AED 220 — below the AED 500 high-value threshold, so this is standard priority. The Arabic reply is drafted and ready.",
    chips: [
      { q: 'Translate reply to English', a: "'Dear Mr. Ahmed Al-Mansoori, we are pleased to inform you that your warranty replacement request has been approved. Your new GEEPAS Glass Blender GF-1234 will be dispatched under tracking number ARX889012 within 2–3 business days. We apologise for any inconvenience.'" },
      { q: 'Is this within policy?', a: 'Yes. AED 220 is well under the AED 500 high-value threshold. Standard one-year warranty applies, purchase was 20 days ago. No secondary approval required.' },
      { q: 'Adjust the tone', a: "The current tone is formal Arabic, which is appropriate for Gulf-market communication. If you'd like it shorter or more empathetic, I can note that for the warranty desk to adjust before sending." },
      { q: 'Flag for quality team', a: 'Noted — this would create a quality flag on GF-1234. Agent 3 will pick it up in the next daily scan at 06:00 GST. Do you want me to note this in the case for the quality team?' },
    ],
  },
  OLSENMARK: {
    open: "This is a high-value claim — AED 850, above the AED 500 threshold, so it's flagged HIGH priority. The Olsenmark Air Conditioner warranty claim is valid. The reply is drafted in English and ready for release to the warranty desk.",
    chips: [
      { q: 'Why is this high priority?', a: 'The declared value of AED 850 exceeds the AED 500 threshold that triggers high-priority handling. This means it goes to a senior warranty desk agent and requires explicit sign-off before the reply is sent.' },
      { q: 'Is the claim valid?', a: 'Yes. The warranty period is standard and the claim falls within it. The product model OM-AC12 is covered under the OLSENMARK warranty programme. No exceptions required.' },
      { q: 'Check similar claims this quarter', a: "I don't have direct access to historical claim data — that would need to be pulled from SAP. However, Agent 3's quality scan shows no velocity spike on OM-AC12, so this appears to be an isolated case." },
      { q: 'Summarise for manager', a: 'OLSENMARK AC warranty claim, AED 850 declared value (HIGH). Claim is valid, reply is drafted. Needs senior warranty desk sign-off before sending. Recommend releasing today.' },
    ],
  },
  _default: {
    open: "I've loaded this item. Let me know what you'd like to check before you action it.",
    chips: [
      { q: 'Summarise for manager', a: "Here's a brief summary: this item is pending approval and has been assigned to the relevant desk. I'd recommend reviewing the details and forwarding when ready." },
      { q: "What's the priority?", a: 'Based on the item type and value, this appears to be standard priority. No immediate escalation flags detected.' },
      { q: 'Any policy concerns?', a: 'No policy flags detected on this item. Proceed as per standard guidelines.' },
      { q: 'Who should action this?', a: 'This is assigned to the relevant desk as shown. You can forward it directly once reviewed.' },
    ],
  },
};

export const FALLBACK_FREN = "I've noted your question. Based on the information available, I'd recommend reviewing the item details and consulting the relevant desk before actioning. Is there a specific aspect you'd like me to focus on?";

export const GFREN_CHIPS = {
  overview: ['Summarise this week', 'Which brand needs attention?', "What's the channel mix?"],
  quality: ['Explain the alerts', 'Why is KRYPTON down?', "What's a velocity spike?"],
  queue: ["What's pending?", 'Any high priority?', 'What can I approve?'],
  runs: ['Summarise this week', 'Which brand needs attention?', 'How many runs today?'],
  guardrails: ['What are the guardrails?', 'Anything contained?', 'Can agents place orders?'],
};
