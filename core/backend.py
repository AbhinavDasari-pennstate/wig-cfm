"""In-memory backend standing in for SAP CRM, SAP MM, the courier API and the
notification fabric.

For the demo this is an offline store so the whole system runs with no creds and
never fails live. In production a ``HttpBackend`` would implement the same surface
with ``httpx`` against the real SAP/courier endpoints (selected via ``WIG_BACKEND``).
Every action is recorded in an audit log so the dashboard can show exactly what the
agents did — including what they deliberately did *not* do.
"""

from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _days_ago(n: float) -> datetime:
    return _now() - timedelta(days=n)


class DemoBackend:
    def __init__(self) -> None:
        self._ids = itertools.count(1)
        self.tickets: dict[str, dict] = {}
        self.corpus: list[dict] = []           # historical resolved tickets (analytics)
        self.quality_alerts: list[dict] = []
        self.audit: list[dict] = []            # everything that happened, in order
        self.human_queue: list[dict] = []      # approval tasks for people
        self.customer_messages: list[dict] = []
        self.safety_events: list[dict] = []    # contained manipulation attempts

        # Seeded master data
        self.inventory: dict[tuple[str, str], dict] = {}
        self.purchase_orders: list[dict] = []
        self.purchase_history: dict[tuple[str, str], list[dict]] = {}

        self._seed()

    # ------------------------------------------------------------------ #
    # Audit helpers
    # ------------------------------------------------------------------ #
    def _log(self, kind: str, **detail) -> None:
        self.audit.append({"kind": kind, "ts": _now().isoformat(), **detail})

    # ------------------------------------------------------------------ #
    # SAP CRM surface
    # ------------------------------------------------------------------ #
    def create_ticket(self, fields: dict) -> dict:
        sap_id = f"CRM-{next(self._ids):05d}"
        rec = {"sap_ticket_id": sap_id, "created_at": _now().isoformat(), **fields}
        self.tickets[sap_id] = rec
        self._log("ticket_created", sap_ticket_id=sap_id,
                  brand=fields.get("brand"), category=fields.get("category"))
        return {"sap_ticket_id": sap_id, "created_at": rec["created_at"]}

    def update_resolution(self, sap_ticket_id: str, notes: str,
                          csat: int | None, nps: int | None, ces: int | None) -> dict:
        rec = self.tickets.get(sap_ticket_id, {"sap_ticket_id": sap_ticket_id})
        rec.update({"resolution_notes": notes, "csat_score": csat,
                    "nps_score": nps, "ces_score": ces,
                    "resolved_at": _now().isoformat()})
        self.tickets[sap_ticket_id] = rec
        self._log("resolution_updated", sap_ticket_id=sap_ticket_id,
                  csat=csat, nps=nps, ces=ces)
        return {"status": "updated"}

    def search_tickets(self, brand: str | None, category: str | None,
                       days_back: int) -> list[dict]:
        cutoff = _days_ago(days_back)
        out = []
        for t in self.corpus:
            if t["created_at"] < cutoff:
                continue
            if brand and t["brand"] != brand:
                continue
            if category and t["category"] != category:
                continue
            out.append(t)
        return out

    def raise_quality_alert(self, alert: dict) -> dict:
        alert_id = f"QA-{next(self._ids):05d}"
        rec = {"alert_id": alert_id, "ts": _now().isoformat(), **alert}
        self.quality_alerts.append(rec)
        self._log("quality_alert", alert_id=alert_id,
                  alert_type=alert.get("alert_type"), brand=alert.get("brand"))
        return {"alert_id": alert_id, "status": "raised"}

    # ------------------------------------------------------------------ #
    # Warranty / courier surface
    # ------------------------------------------------------------------ #
    def check_warranty(self, purchase_date: str) -> dict:
        try:
            pd = datetime.fromisoformat(purchase_date)
            if pd.tzinfo is None:
                pd = pd.replace(tzinfo=timezone.utc)
        except ValueError:
            return {"eligible": False, "warranty_end_date": None, "claim_id": None}
        end = pd + timedelta(days=365)
        eligible = end >= _now()
        claim = f"CLM-{next(self._ids):05d}" if eligible else None
        return {"eligible": eligible, "warranty_end_date": end.date().isoformat(),
                "claim_id": claim}

    def track_shipment(self, tracking_number: str) -> dict:
        return {"status": "in_transit", "last_update": _now().isoformat(),
                "estimated_delivery": (_now() + timedelta(days=2)).date().isoformat()}

    # ------------------------------------------------------------------ #
    # Procurement surface (READ + notify only — no PO creation exists)
    # ------------------------------------------------------------------ #
    def check_inventory(self, sku: str, store: str) -> dict:
        inv = self.inventory.get((sku, store), {"shelf": 0, "backroom": 0})
        return {"shelf_stock": inv["shelf"], "backroom_stock": inv["backroom"],
                "total_stock": inv["shelf"] + inv["backroom"],
                "last_updated": _now().isoformat()}

    def check_existing_po(self, sku: str, store: str) -> dict:
        for po in self.purchase_orders:
            if po["sku"] == sku and po["store"] == store and po["status"] == "Open":
                eta = datetime.fromisoformat(po["expected_delivery_date"])
                delay = max(0, (_now().date() - eta.date()).days)
                return {"po_exists": True, "po_number": po["po_number"],
                        "expected_delivery_date": po["expected_delivery_date"],
                        "delay_days": delay, "supplier": po["supplier"]}
        return {"po_exists": False, "po_number": None,
                "expected_delivery_date": None, "delay_days": None, "supplier": None}

    def get_purchase_history(self, sku: str, store: str) -> dict:
        orders = self.purchase_history.get((sku, store), [])
        count = len(orders)
        intervals = []
        for a, b in zip(orders, orders[1:]):
            intervals.append(abs((datetime.fromisoformat(a["created_at"])
                                  - datetime.fromisoformat(b["created_at"])).days))
        avg = round(sum(intervals) / len(intervals), 1) if intervals else None
        is_regular = bool(avg is not None and 7 <= avg <= 60 and count >= 2)
        return {"order_count": count, "orders": orders,
                "avg_interval_days": avg, "is_regular": is_regular}

    # ------------------------------------------------------------------ #
    # Notifications — all of these are "telling a human"
    # ------------------------------------------------------------------ #
    def notify_store_manager(self, store: str, message: str, **ctx) -> dict:
        self._log("store_manager_notified", store=store, message=message, **ctx)
        return {"status": "notified", "channel": "store_manager"}

    def notify_procurement(self, message: str, **ctx) -> dict:
        self._log("procurement_notified", message=message, **ctx)
        return {"status": "notified", "channel": "procurement"}

    def notify_human_buyer(self, sku: str, store: str, reason: str,
                           recommendation: str, **ctx) -> dict:
        task_id = f"WF-{next(self._ids):05d}"
        task = {"workflow_task_id": task_id, "type": "PROCUREMENT_APPROVAL",
                "sku": sku, "store": store, "reason": reason,
                "recommendation": recommendation, "assigned_to": "Procurement Buyer Desk",
                "status": "pending_approval", "ts": _now().isoformat(), **ctx}
        self.human_queue.append(task)
        self._log("buyer_notified", workflow_task_id=task_id, sku=sku, reason=reason)
        return {"workflow_task_id": task_id, "assigned_to": task["assigned_to"],
                "status": "pending_approval"}

    def request_fulfillment_approval(self, claim_id: str, brand: str,
                                     product: str, declared_value_aed: float,
                                     drafted_message: str) -> dict:
        task_id = f"WF-{next(self._ids):05d}"
        high = declared_value_aed > 500
        task = {"workflow_task_id": task_id, "type": "WARRANTY_FULFILLMENT",
                "claim_id": claim_id, "brand": brand, "product": product,
                "declared_value_aed": declared_value_aed,
                "priority": "HIGH (>AED 500)" if high else "standard",
                "assigned_to": "Warranty Desk", "status": "pending_approval",
                "drafted_message": drafted_message, "ts": _now().isoformat()}
        self.human_queue.append(task)
        self._log("fulfillment_approval_requested", workflow_task_id=task_id,
                  claim_id=claim_id, high_value=high)
        return {"workflow_task_id": task_id, "status": "pending_approval",
                "priority": task["priority"]}

    def flag_spare_part_shortage(self, part: str, model: str, brand: str,
                                 count: int) -> dict:
        return self.raise_quality_alert({"alert_type": "spare_part_shortage",
                                         "brand": brand, "part_name": part,
                                         "product_model": model, "ticket_count": count})

    def send_customer_message(self, ticket_id: str, language: str,
                              channel: str, message: str) -> dict:
        rec = {"ticket_id": ticket_id, "language": language, "channel": channel,
               "message": message, "sent_at": _now().isoformat()}
        self.customer_messages.append(rec)
        self._log("customer_notified", ticket_id=ticket_id, language=language)
        return {"status": "sent"}

    def log_safety_event(self, detail: dict) -> None:
        self.safety_events.append({"ts": _now().isoformat(), **detail})
        self._log("manipulation_contained", **detail)

    # ------------------------------------------------------------------ #
    # Snapshot for the dashboard
    # ------------------------------------------------------------------ #
    def snapshot(self) -> dict:
        return {
            "tickets": list(self.tickets.values()),
            "quality_alerts": self.quality_alerts,
            "human_queue": self.human_queue,
            "customer_messages": self.customer_messages,
            "safety_events": self.safety_events,
            "audit": self.audit,
        }

    # ------------------------------------------------------------------ #
    # Seed master data + analytics corpus
    # ------------------------------------------------------------------ #
    def _seed(self) -> None:
        store = "NESTO-DXB-12"

        # Inventory for the three procurement diagnosis paths
        self.inventory[("RF-AF250", store)] = {"shelf": 0, "backroom": 0}   # Case 1: no stock, no PO
        self.inventory[("DC-PAN20", store)] = {"shelf": 0, "backroom": 0}   # Case 2: no stock, open PO
        self.inventory[("RF-BL100", store)] = {"shelf": 0, "backroom": 8}   # Case 3: backroom has stock

        # Open, delayed PO for the Case 2 SKU
        self.purchase_orders.append({
            "po_number": "PO-778412", "sku": "DC-PAN20", "store": store,
            "status": "Open", "supplier": "DELCASA-DIST-01",
            "expected_delivery_date": _days_ago(3).date().isoformat(),  # 3 days late
        })

        # Regular purchase history for RF-AF250 → strong reorder recommendation to a human
        self.purchase_history[("RF-AF250", store)] = [
            {"po_number": "PO-770001", "created_at": _days_ago(14).isoformat(),
             "quantity": 12, "unit_price_aed": 18.0},
            {"po_number": "PO-769002", "created_at": _days_ago(28).isoformat(),
             "quantity": 12, "unit_price_aed": 18.0},
            {"po_number": "PO-768003", "created_at": _days_ago(43).isoformat(),
             "quantity": 12, "unit_price_aed": 18.0},
        ]

        # Analytics corpus: resolved tickets across brands for digest + coaching,
        # plus a velocity cluster on a newly launched GEEPAS kettle. Score patterns
        # are tuned to be believable: GEEPAS/NESTO are strong, ROYALFORD is the
        # coaching target (NPS below the +32 benchmark, low CES). Base tickets sit
        # in the 3–6 day window so the ONLY velocity alert is the GK-NEW cluster.
        cats = ["PRODUCT_QUALITY", "DELIVERY", "STORE_EXPERIENCE", "WARRANTY_RETURN"]
        profiles = {
            "GEEPAS":    {"region": "Dubai",     "n": 21,
                          "csat": [5, 4, 5, 4, 5, 4, 4], "nps": [10, 9, 9, 8, 10, 9, 9],
                          "ces": [5, 4, 4, 5, 4, 4, 4]},
            "NESTO":     {"region": "Sharjah",   "n": 21,
                          "csat": [4, 4, 5, 4, 4, 4, 3], "nps": [9, 8, 10, 7, 9, 8, 6],
                          "ces": [4, 3, 4, 3, 4, 4, 3]},
            "ROYALFORD": {"region": "Abu Dhabi", "n": 21,
                          "csat": [3, 4, 3, 4, 3, 3, 4], "nps": [9, 8, 7, 9, 6, 8, 7],
                          "ces": [2, 3, 2, 3, 2, 2, 3]},
        }
        for brand, p in profiles.items():
            for i in range(p["n"]):
                self.corpus.append({
                    "brand": brand, "product_sku": f"{brand[:2]}-{1000 + (i % 4)}",
                    "category": cats[i % len(cats)], "region": p["region"],
                    # Days 4–6: safely inside the 7-day digest window, outside the
                    # 3-day "recent" window, so base tickets never trip velocity.
                    "created_at": _days_ago(4 + (i % 3)), "resolved": True,
                    "csat_score": p["csat"][i % 7], "nps_score": p["nps"][i % 7],
                    "ces_score": p["ces"][i % 7], "store_name": f"{brand} Store",
                })

        # Velocity cluster: GEEPAS GK-NEW kettle — 2 complaints in the prior 3-day
        # window, 6 in the most recent 3-day window (a +200% spike, well under the
        # legacy volume-15 threshold). This is the "caught it early" moment.
        for d in (4, 5):  # prior window (days 3-6 ago)
            self.corpus.append({
                "brand": "GEEPAS", "product_sku": "GK-NEW", "category": "PRODUCT_QUALITY",
                "region": "Dubai", "created_at": _days_ago(d), "resolved": True,
                "csat_score": 2, "nps_score": 3, "ces_score": 2,
                "store_name": "GEEPAS Store",
            })
        for d in (0.3, 0.8, 1.1, 1.6, 2.0, 2.4):  # recent window (last 3 days)
            self.corpus.append({
                "brand": "GEEPAS", "product_sku": "GK-NEW", "category": "PRODUCT_QUALITY",
                "region": "Dubai", "created_at": _days_ago(d), "resolved": True,
                "csat_score": 2, "nps_score": 2, "ces_score": 2,
                "store_name": "GEEPAS Store",
            })

        # Additional brands: PARAJOHN, KRYPTON, OLSENMARK, DELCASA.
        # Score profiles are tuned to tell a clear story: KRYPTON declining
        # (velocity spike explains it), OLSENMARK/DELCASA improving.
        more_profiles = {
            "PARAJOHN":  {"region": "Dubai Marina",  "n": 14,
                          "csat": [4, 5, 4, 4, 5, 4, 4], "nps": [9, 8, 9, 8, 9, 8, 9],
                          "ces": [4, 4, 3, 4, 4, 3, 4]},
            "KRYPTON":   {"region": "Abu Dhabi",     "n": 14,
                          "csat": [4, 3, 4, 4, 3, 4, 4], "nps": [8, 7, 8, 7, 8, 7, 8],
                          "ces": [3, 4, 3, 4, 3, 3, 4]},
            "OLSENMARK": {"region": "Sharjah",       "n": 12,
                          "csat": [4, 4, 4, 3, 4, 4, 5], "nps": [8, 8, 7, 8, 9, 8, 8],
                          "ces": [3, 4, 3, 3, 4, 3, 4]},
            "DELCASA":   {"region": "Dubai",         "n": 8,
                          "csat": [4, 3, 4, 4, 3, 4, 4], "nps": [7, 6, 8, 7, 6, 7, 8],
                          "ces": [3, 3, 4, 3, 3, 4, 3]},
        }
        for brand, p in more_profiles.items():
            for i in range(p["n"]):
                self.corpus.append({
                    "brand": brand, "product_sku": f"{brand[:2]}-{1000 + (i % 4)}",
                    "category": cats[i % len(cats)], "region": p["region"],
                    "created_at": _days_ago(4 + (i % 3)), "resolved": True,
                    "csat_score": p["csat"][i % 7], "nps_score": p["nps"][i % 7],
                    "ces_score": p["ces"][i % 7], "store_name": f"{brand} Store",
                })

        # KRYPTON KT-IRON21 velocity cluster — new SKU, 0 prior → 4 recent.
        # Drags KRYPTON brand NPS into negative territory, making the dashboard
        # story clear: the velocity spike is reflected in brand metrics.
        for d in (0.5, 1.0, 1.5, 2.0):
            self.corpus.append({
                "brand": "KRYPTON", "product_sku": "KT-IRON21", "category": "PRODUCT_QUALITY",
                "region": "Abu Dhabi", "created_at": _days_ago(d), "resolved": True,
                "csat_score": 2, "nps_score": 2, "ces_score": 2,
                "store_name": "KRYPTON Store",
            })

        # Prior-week corpus (days 8–14) for trend-arrow computation.
        # ROYALFORD prior NPS is high (+60) vs current (+14) — dramatic decline,
        # explains why it is the coaching target. KRYPTON prior is solid; the
        # new-SKU spike is the sole cause of this week's drop.
        prior_profiles = {
            "GEEPAS":    {"region": "Dubai",        "n": 16,
                          "csat": [4, 4, 4, 5, 4, 4, 4], "nps": [9, 8, 8, 9, 8, 8, 9],
                          "ces": [4, 4, 3, 4, 4, 3, 4]},
            "NESTO":     {"region": "Sharjah",      "n": 14,
                          "csat": [3, 4, 3, 4, 3, 4, 4], "nps": [7, 7, 8, 7, 7, 8, 7],
                          "ces": [3, 3, 3, 4, 3, 3, 4]},
            "ROYALFORD": {"region": "Abu Dhabi",    "n": 18,
                          "csat": [4, 3, 4, 4, 3, 4, 4], "nps": [9, 8, 9, 9, 8, 8, 9],
                          "ces": [3, 3, 3, 3, 2, 3, 3]},
            "PARAJOHN":  {"region": "Dubai Marina", "n": 11,
                          "csat": [4, 4, 5, 4, 4, 5, 4], "nps": [8, 9, 8, 9, 8, 9, 8],
                          "ces": [3, 4, 4, 3, 4, 3, 4]},
            "KRYPTON":   {"region": "Abu Dhabi",    "n": 13,
                          "csat": [4, 4, 4, 3, 4, 4, 4], "nps": [8, 8, 7, 8, 8, 7, 8],
                          "ces": [3, 3, 4, 3, 3, 4, 3]},
            "OLSENMARK": {"region": "Sharjah",      "n": 9,
                          "csat": [3, 4, 4, 3, 4, 3, 4], "nps": [7, 8, 7, 7, 8, 7, 7],
                          "ces": [3, 3, 3, 2, 3, 3, 3]},
            "DELCASA":   {"region": "Dubai",        "n": 6,
                          "csat": [3, 4, 3, 4, 3, 4, 3], "nps": [6, 7, 6, 7, 6, 7, 6],
                          "ces": [3, 2, 3, 3, 2, 3, 3]},
        }
        for brand, p in prior_profiles.items():
            for i in range(p["n"]):
                self.corpus.append({
                    "brand": brand, "product_sku": f"{brand[:2]}-{1000 + (i % 4)}",
                    "category": cats[i % len(cats)], "region": p["region"],
                    "created_at": _days_ago(8 + (i % 7)), "resolved": True,
                    "csat_score": p["csat"][i % 7], "nps_score": p["nps"][i % 7],
                    "ces_score": p["ces"][i % 7], "store_name": f"{brand} Store",
                    "prior_week": True,
                })

        # Pre-seeded human queue items — represent tickets raised before the
        # demo scenarios ran. Gives the queue the depth of a live system.
        self.human_queue.extend([
            {
                "workflow_task_id": "WF-SEED-01",
                "type": "PROCUREMENT_APPROVAL",
                "sku": "DC-PAN20",
                "store": "NESTO Dubai Festival City",
                "reason": "DELAYED_PO",
                "recommendation": (
                    "PO-778412 with DELCASA-DIST-01 is 3 days overdue. "
                    "Contact supplier immediately. Prepare emergency reorder "
                    "if unresolved within 24 hours."
                ),
                "assigned_to": "Procurement Buyer Desk",
                "status": "pending_approval",
                "priority": "standard",
                "ts": _days_ago(0.5).isoformat(),
            },
            {
                "workflow_task_id": "WF-SEED-02",
                "type": "WARRANTY_FULFILLMENT",
                "claim_id": "CLM-SEED-01",
                "brand": "OLSENMARK",
                "product": "Olsenmark Air Conditioner OM-AC12",
                "declared_value_aed": 850.0,
                "priority": "HIGH (>AED 500)",
                "assigned_to": "Warranty Desk",
                "status": "pending_approval",
                "drafted_message": (
                    "Dear valued customer, we are pleased to confirm that your "
                    "warranty claim for the Olsenmark Air Conditioner OM-AC12 has "
                    "been approved. Our warranty team will contact you within 24 hours "
                    "to arrange collection and replacement. We sincerely apologise for "
                    "any inconvenience caused."
                ),
                "ts": _days_ago(0.3).isoformat(),
            },
            {
                "workflow_task_id": "WF-SEED-03",
                "type": "PROCUREMENT_APPROVAL",
                "sku": "KT-IRON21",
                "store": "NESTO Abu Dhabi",
                "reason": "VELOCITY_SPIKE",
                "recommendation": (
                    "New SKU KT-IRON21 showing 4 quality complaints in 3 days — "
                    "no prior baseline. Recommend pausing further procurement pending "
                    "quality investigation. Notify product team immediately."
                ),
                "assigned_to": "Procurement Buyer Desk",
                "status": "pending_approval",
                "priority": "standard",
                "ts": _days_ago(0.1).isoformat(),
            },
        ])
