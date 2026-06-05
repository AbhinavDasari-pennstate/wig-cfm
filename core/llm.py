"""Injectable LLM runner.

The agents never import the Claude Agent SDK directly. They depend on the
``LLMRunner`` protocol and call ``run(task, payload)``. This gives us two things:

1. **Production:** ``SDKRunner`` (not built for the offline demo) would turn each
   task into a prompt for the Claude Agent SDK and parse the JSON response.
2. **Demo / tests:** ``ScriptedLLMRunner`` is a deterministic brain — real
   keyword/script classification plus multilingual templates — so the demo runs
   anywhere with no API key and never fails live.

Swapping production in is a one-line change at the orchestrator. The deterministic
*guardrails* (routing, diagnosis, velocity, the propose-don't-transact rule) live
in the agents, never here — so the choice of brain cannot weaken them.
"""

from __future__ import annotations

import re
from typing import Protocol

from models.feedback_ticket import Brand, FeedbackCategory, Language


class LLMRunner(Protocol):
    async def run(self, task: str, payload: dict) -> dict:  # pragma: no cover - interface
        ...


# --------------------------------------------------------------------------- #
# Deterministic language / brand / category detection
# --------------------------------------------------------------------------- #

_ARABIC = re.compile(r"[؀-ۿ]")
_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_MALAYALAM = re.compile(r"[ഀ-ൿ]")


def detect_language(text: str) -> Language:
    if _ARABIC.search(text):
        return Language.ARABIC
    if _MALAYALAM.search(text):
        return Language.MALAYALAM
    if _DEVANAGARI.search(text):
        return Language.HINDI
    return Language.ENGLISH


_BRAND_KEYWORDS = {
    Brand.GEEPAS: ["geepas", "جيباس"],
    Brand.NESTO: ["nesto", "نستو"],
    Brand.ROYALFORD: ["royalford", "royal ford", "رويالفورد"],
    Brand.PARAJOHN: ["parajohn", "para john"],
    Brand.OLSENMARK: ["olsenmark", "olsen mark"],
    Brand.KRYPTON: ["krypton", "كريبتون"],
    Brand.DELCASA: ["delcasa", "del casa"],
    Brand.JAZP: ["jazp", "jazp.com"],
    Brand.WIGME: ["wigme", "wigme.com"],
}

_CATEGORY_KEYWORDS = {
    FeedbackCategory.WARRANTY_RETURN: [
        "warranty", "broken", "not working", "stopped working", "faulty", "repair",
        "return", "replace", "replacement", "damaged", "ضمان", "معطل", "لا يعمل",
        "वारंटी",
    ],
    FeedbackCategory.OUT_OF_STOCK: [
        "out of stock", "shelf", "empty", "missing", "not available", "can't find",
        "cannot find", "couldn't find", "restock", "نفد", "غير متوفر", "الرف",
        "स्टॉक", "नहीं मिला",
    ],
    FeedbackCategory.PRODUCT_QUALITY: [
        "quality", "defective", "poor", "leaks", "leaking", "rusty", "cheap", "expired",
        "rotten", "خراب", "جودة", "गुणवत्ता", "खराब",
    ],
    FeedbackCategory.DELIVERY: [
        "delivery", "delivered", "late", "courier", "shipping", "shipment", "توصيل",
    ],
    FeedbackCategory.STORE_EXPERIENCE: [
        "staff", "queue", "checkout", "cashier", "rude", "waiting", "counter", "service",
    ],
    FeedbackCategory.COMPLIMENT: [
        "thank you", "thanks", "excellent", "great", "amazing", "wonderful", "love",
        "شكرا", "ممتاز", "धन्यवाद",
    ],
}

_URGENCY_5 = [
    "fire", "smoke", "shock", "electric shock", "spark", "burn", "burning", "hazard",
    "injury", "injured", "regulatory", "recall", "danger", "حريق", "خطر", "صعقة",
]
_URGENCY_4 = [
    "again", "third time", "3rd time", "second time", "still not", "unacceptable",
    "lawyer", "legal", "refund now", "furious", "worst", "ridiculous",
]


def _hit(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def classify(text: str, brand_hint: Brand | None = None) -> dict:
    low = text.lower()

    brand = brand_hint
    if brand is None:
        for b, kws in _BRAND_KEYWORDS.items():
            if _hit(low, kws):
                brand = b
                break
        brand = brand or Brand.OTHER

    category = FeedbackCategory.GENERAL
    for cat, kws in _CATEGORY_KEYWORDS.items():
        if _hit(low, kws):
            category = cat
            break

    if _hit(low, _URGENCY_5):
        urgency = 5
    elif _hit(low, _URGENCY_4):
        urgency = 4
    elif category in (FeedbackCategory.WARRANTY_RETURN, FeedbackCategory.OUT_OF_STOCK):
        urgency = 3
    elif category == FeedbackCategory.COMPLIMENT:
        urgency = 1
    else:
        urgency = 2

    return {"brand": brand, "category": category, "urgency_score": urgency}


# --------------------------------------------------------------------------- #
# Multilingual message templates (formal Gulf-market tone)
# --------------------------------------------------------------------------- #

_T = {
    "ack": {
        Language.ENGLISH: "Dear {name}, thank you for contacting {brand}. We have received your message and our team is reviewing it with priority. We will be in touch shortly.",
        Language.ARABIC: "حضرتكم {name}، نشكركم على تواصلكم مع {brand}. لقد استلمنا رسالتكم ويقوم فريقنا بمراجعتها على وجه الأولوية، وسنعاود التواصل معكم قريباً.",
        Language.HINDI: "प्रिय {name}, {brand} से संपर्क करने के लिए धन्यवाद। हमें आपका संदेश प्राप्त हो गया है और हमारी टीम इसकी प्राथमिकता से समीक्षा कर रही है। हम शीघ्र ही आपसे संपर्क करेंगे।",
        Language.MALAYALAM: "പ്രിയ {name}, {brand}-യുമായി ബന്ധപ്പെട്ടതിന് നന്ദി. താങ്കളുടെ സന്ദേശം ഞങ്ങൾക്ക് ലഭിച്ചു, ഞങ്ങളുടെ ടീം മുൻഗണനയോടെ പരിശോധിക്കുന്നു. ഉടൻ ബന്ധപ്പെടാം.",
    },
    "loop_close": {
        Language.ENGLISH: "Dear {name}, we are pleased to confirm your replacement {product} has been dispatched. Tracking number: {tracking}. Thank you for your patience — we look forward to your continued trust in {brand}.",
        Language.ARABIC: "حضرتكم {name}، يسعدنا تأكيد إرسال البديل {product}. رقم التتبع: {tracking}. نشكركم على سعة صدركم، ونتطلع إلى استمرار ثقتكم في {brand}.",
        Language.HINDI: "प्रिय {name}, हमें यह पुष्टि करते हुए खुशी है कि आपका प्रतिस्थापन {product} भेज दिया गया है। ट्रैकिंग संख्या: {tracking}। आपके धैर्य के लिए धन्यवाद — {brand} में आपके निरंतर विश्वास की आशा करते हैं।",
        Language.MALAYALAM: "പ്രിയ {name}, താങ്കളുടെ പകരം {product} അയച്ചതായി സ്ഥിരീകരിക്കുന്നതിൽ സന്തോഷം. ട്രാക്കിംഗ് നമ്പർ: {tracking}. ക്ഷമയ്ക്ക് നന്ദി — {brand}-യിലുള്ള താങ്കളുടെ വിശ്വാസം തുടരുമെന്ന് പ്രതീക്ഷിക്കുന്നു.",
    },
    "decline": {
        Language.ENGLISH: "Dear {name}, thank you for reaching out. After review, we found that your {product} is outside its warranty period, so we are unable to process a replacement. We would be glad to advise on a paid repair. We value your relationship with {brand}.",
        Language.ARABIC: "حضرتكم {name}، نشكركم على تواصلكم. بعد المراجعة، تبيّن أن {product} خارج فترة الضمان، لذا لا يمكننا تقديم بديل. يسعدنا إرشادكم إلى خيار الإصلاح المدفوع. نقدّر علاقتكم بـ {brand}.",
        Language.HINDI: "प्रिय {name}, संपर्क करने के लिए धन्यवाद। समीक्षा के बाद हमने पाया कि आपका {product} वारंटी अवधि से बाहर है, इसलिए हम प्रतिस्थापन नहीं कर सकते। हम सशुल्क मरम्मत पर सलाह देने में प्रसन्न होंगे। {brand} के साथ आपके संबंध को हम महत्व देते हैं।",
        Language.MALAYALAM: "പ്രിയ {name}, ബന്ധപ്പെട്ടതിന് നന്ദി. പരിശോധനയിൽ താങ്കളുടെ {product} വാറന്റി കാലയളവിന് പുറത്താണെന്ന് കണ്ടെത്തി, അതിനാൽ പകരം നൽകാനാവില്ല. പണമടച്ചുള്ള റിപ്പയർ സംബന്ധിച്ച് സഹായിക്കാം. {brand}-യുമായുള്ള ബന്ധത്തെ ഞങ്ങൾ വിലമതിക്കുന്നു.",
    },
    "restock": {
        Language.ENGLISH: "Dear {name}, great news — your feedback was heard! {product} is now available in Aisle {aisle} at {store}. Thank you for helping us improve.",
        Language.ARABIC: "حضرتكم {name}، خبر سار — لقد استمعنا إلى ملاحظتكم! يتوفر الآن {product} في الممر {aisle} في {store}. نشكركم على مساعدتنا في التحسّن.",
        Language.HINDI: "प्रिय {name}, अच्छी खबर — आपकी प्रतिक्रिया सुनी गई! {product} अब {store} के गलियारा {aisle} में उपलब्ध है। बेहतर बनाने में मदद के लिए धन्यवाद।",
        Language.MALAYALAM: "പ്രിയ {name}, സന്തോഷവാർത്ത — താങ്കളുടെ അഭിപ്രായം ഞങ്ങൾ കേട്ടു! {product} ഇപ്പോൾ {store}-ലെ ഐൽ {aisle}-ൽ ലഭ്യമാണ്. മെച്ചപ്പെടാൻ സഹായിച്ചതിന് നന്ദി.",
    },
}

_SURVEY = {
    Language.ENGLISH: [
        "How satisfied are you with how your request was handled? (1–5)",
        "How likely are you to recommend {brand} to a friend or family member? (0–10)",
        "How easy was it to get your issue resolved? (1–5)",
    ],
    Language.ARABIC: [
        "ما مدى رضاكم عن طريقة معالجة طلبكم؟ (1–5)",
        "ما مدى احتمالية أن توصوا بـ {brand} لصديق أو أحد أفراد العائلة؟ (0–10)",
        "ما مدى سهولة حل مشكلتكم؟ (1–5)",
    ],
    Language.HINDI: [
        "आपके अनुरोध को संभालने के तरीके से आप कितने संतुष्ट हैं? (1–5)",
        "आप {brand} को किसी मित्र या परिवार को कितना अनुशंसित करेंगे? (0–10)",
        "आपकी समस्या हल करना कितना आसान था? (1–5)",
    ],
    Language.MALAYALAM: [
        "താങ്കളുടെ അഭ്യർത്ഥന കൈകാര്യം ചെയ്ത രീതിയിൽ എത്ര സംതൃപ്തനാണ്? (1–5)",
        "{brand}-യെ ഒരു സുഹൃത്തിനോ കുടുംബത്തിനോ ശുപാർശ ചെയ്യാൻ എത്ര സാധ്യത? (0–10)",
        "താങ്കളുടെ പ്രശ്നം പരിഹരിക്കാൻ എത്ര എളുപ്പമായിരുന്നു? (1–5)",
    ],
}


def _brand_display(brand) -> str:
    if not isinstance(brand, str) or brand.upper() in ("", "OTHER"):
        return "WIG"
    return brand.title()


def _fill(template: str, payload: dict) -> str:
    safe = {
        "name": payload.get("customer_name") or "Valued Customer",
        "brand": _brand_display(payload.get("brand")),
        "product": payload.get("product_name") or payload.get("product_sku") or "your item",
        "tracking": payload.get("tracking") or "—",
        "aisle": payload.get("aisle") or "—",
        "store": payload.get("store_name") or "your NESTO store",
    }
    return template.format(**safe)


class ScriptedLLMRunner:
    """Deterministic, offline brain used for the demo and tests."""

    async def run(self, task: str, payload: dict) -> dict:
        if task == "intake_triage":
            text = payload["raw_text"]
            lang = detect_language(text)
            brand_hint = payload.get("brand_hint")
            result = classify(text, brand_hint)
            ack = _fill(
                _T["ack"][lang],
                {**payload, "brand": result["brand"].value if result["brand"] else "WIG"},
            )
            return {
                "language": lang.value,
                "brand": result["brand"].value,
                "category": result["category"].value,
                "urgency_score": result["urgency_score"],
                "acknowledgment": ack,
            }

        if task in ("draft_loop_close", "draft_decline", "draft_restock"):
            lang = Language(payload.get("language", "ENGLISH"))
            kind = task.replace("draft_", "")
            return {"message": _fill(_T[kind][lang], payload)}

        if task == "draft_survey":
            lang = Language(payload.get("language", "ENGLISH"))
            brand = (payload.get("brand") or "WIG")
            brand = brand.title() if isinstance(brand, str) else "WIG"
            return {"questions": [q.format(brand=brand) for q in _SURVEY[lang]]}

        if task == "summarise_themes":
            # Deterministic theme summary from a list of complaint texts.
            themes: dict[str, int] = {}
            for t in payload.get("texts", []):
                cat = classify(t)["category"].value
                themes[cat] = themes.get(cat, 0) + 1
            top = sorted(themes.items(), key=lambda kv: kv[1], reverse=True)[:3]
            return {"themes": [t for t, _ in top]}

        raise ValueError(f"ScriptedLLMRunner: unknown task {task!r}")
