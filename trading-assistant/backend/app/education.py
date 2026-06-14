"""The AI tutor + the structured lesson track.

Education only: the system prompt forbids buy/sell signals and personalized
financial advice. The tutor is grounded in the user's own recent stats so its
answers are relevant to how *they* actually trade.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .analysis import summarize
from .config import settings
from .models import ChatMessage, RoundTrip, User

SYSTEM_PROMPT = """אתה "מנטור" — מאמן מסחר אישי לסוחרים מתחילים בשוק ההון, מט"ח וקריפטו.
התפקיד שלך הוא חינוכי בלבד: ללמד מושגים, ניהול סיכונים, פסיכולוגיה של מסחר ומשמעת.

כללים מחייבים:
- אסור לך לתת ייעוץ השקעות, איתותי קנייה/מכירה, או המלצה לקנות/למכור נכס מסוים.
- אם מבקשים ממך "מה לקנות" או "האם זה יעלה", הסבר באדיבות שאתה כלי חינוכי ולא נותן
  ייעוץ, והפנה את השיחה ללמידה (ניהול סיכון, אסטרטגיה, משמעת).
- ענה בעברית, בקצרה וברור, בגובה העיניים של מתחיל. השתמש בדוגמאות.
- כשרלוונטי, התבסס על הנתונים האישיים של המשתמש שסופקו לך כדי לתת משוב ממוקד.
- עודד הרגלים בריאים: stop-loss, גודל פוזיציה קבוע, יומן מסחר, סבלנות."""


LESSONS = [
    {
        "id": "risk-basics",
        "level": 1,
        "title": "ניהול סיכונים — הדבר הכי חשוב",
        "summary": "כמה להשקיע בכל עסקה ולמה לעולם לא לסכן הכול.",
        "content": (
            "הכלל הראשון של סוחר ששורד: אל תסכן יותר מ-1%–2% מההון בעסקה אחת. "
            "ככה גם רצף הפסדים לא מוחק אותך. לפני כל עסקה תשאל: 'כמה אני מוכן להפסיד "
            "כאן?' — והגדר stop-loss בהתאם. גודל הפוזיציה נגזר מהסטופ, לא להפך."
        ),
    },
    {
        "id": "stop-loss",
        "level": 1,
        "title": "מה זה Stop-Loss ואיך מגדירים",
        "summary": "הרשת ביטחון שמונעת הפסד קטן מלהפוך לאסון.",
        "content": (
            "Stop-loss הוא רף יציאה שמגדירים מראש: אם המחיר מגיע אליו — יוצאים, בלי "
            "ויכוח. המטרה היא להגביל הפסד ולהוציא את הרגש מההחלטה. מתחילים שמפסידים "
            "גדול הם כמעט תמיד מתחילים בלי סטופ."
        ),
    },
    {
        "id": "rr-ratio",
        "level": 2,
        "title": "יחס סיכון/סיכוי (Risk/Reward)",
        "summary": "למה אפשר לנצח גם עם 40% עסקאות מנצחות.",
        "content": (
            "אם בכל עסקה אתה מסכן 1 כדי להרוויח 2 (יחס 1:2), אתה יכול לטעות ברוב "
            "העסקאות ועדיין להיות ברווח. חפש עסקאות שבהן הפוטנציאל גדול מהסיכון, "
            "ותעדיף איכות על כמות."
        ),
    },
    {
        "id": "psychology",
        "level": 2,
        "title": "פסיכולוגיה: FOMO ומסחר נקמה",
        "summary": "האויב הכי גדול של הסוחר הוא הוא עצמו.",
        "content": (
            "מסחר נקמה (revenge trade) — כניסה מהירה אחרי הפסד כדי 'להחזיר' — הוא "
            "אחד הדפוסים ההרסניים ביותר. גם FOMO (פחד לפספס) גורם לכניסות מאוחרות "
            "ומסוכנות. הכלי הכי חזק: לקחת הפסקה אחרי הפסד ולחזור לתוכנית."
        ),
    },
    {
        "id": "journal",
        "level": 3,
        "title": "יומן מסחר — איך לומדים מטעויות",
        "summary": "מה שלא מודדים, לא משתפרים בו.",
        "content": (
            "תיעוד כל עסקה (כניסה, יציאה, סיבה, רגש) הופך טעויות לשיעורים. אצלך זה "
            "קורה אוטומטית — המערכת רושמת כל עסקה ומזהה את הדפוסים החוזרים שלך. "
            "פעם בשבוע עבור על הסקירה ושאל: מה הדפוס שהכי עולה לי כסף?"
        ),
    },
    {
        "id": "position-sizing",
        "level": 3,
        "title": "גודל פוזיציה עקבי",
        "summary": "למה 'להכפיל כדי להחזיר' זו מלכודת.",
        "content": (
            "סוחרים מתחילים נוטים להגדיל פוזיציה אחרי הפסד או כש'בטוחים'. זה מגדיל "
            "תנודתיות ומסכן את החשבון. גודל פוזיציה צריך להיגזר מנוסחת סיכון קבועה — "
            "לא מהביטחון או מהרצון לתקן הפסד."
        ),
    },
]


def _user_context(db: Session, user: User) -> str:
    trips = db.scalars(select(RoundTrip).where(RoundTrip.user_id == user.id)).all()
    if not trips:
        return "למשתמש עדיין אין עסקאות סגורות מתועדות."
    s = summarize(trips)
    return (
        f"נתוני המשתמש (לשבועות האחרונים): {s['trades']} עסקאות סגורות, "
        f"אחוז הצלחה {s['win_rate']}%, רווח/הפסד מצטבר ${s['total_pnl']}, "
        f"רווח ממוצע ${s['avg_win']}, הפסד ממוצע ${s['avg_loss']}, "
        f"profit factor {s['profit_factor']}."
    )


def answer(db: Session, user: User, message: str) -> str:
    """Persist the exchange and return the tutor's reply."""
    db.add(ChatMessage(user_id=user.id, role="user", content=message))
    db.flush()

    reply = _generate_reply(db, user, message)

    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    db.commit()
    return reply


def _generate_reply(db: Session, user: User, message: str) -> str:
    if not settings.ai_enabled:
        return _fallback_reply(message)

    # Build a short rolling history for context.
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
        .all()
    )
    history.reverse()
    messages = [{"role": m.role, "content": m.content} for m in history]

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        system = SYSTEM_PROMPT + "\n\n" + _user_context(db, user)
        resp = client.messages.create(
            model=settings.chat_model,
            max_tokens=1024,
            system=system,
            messages=messages,
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()
    except Exception as exc:  # API/network failure -> graceful fallback
        print(f"[tutor] AI call failed: {exc}")
        return _fallback_reply(message)


def _fallback_reply(message: str) -> str:
    """Keyword-matched lesson answer when the AI tutor is unavailable."""
    text = message.lower()
    keywords = {
        "stop": "stop-loss", "סטופ": "stop-loss", "סיכון": "risk-basics",
        "פסיכולוג": "psychology", "נקמה": "psychology", "יומן": "journal",
        "גודל": "position-sizing", "פוזיצי": "position-sizing",
    }
    for kw, lesson_id in keywords.items():
        if kw in text:
            lesson = next(le for le in LESSONS if le["id"] == lesson_id)
            return f"{lesson['title']}\n\n{lesson['content']}"
    return (
        "אני כאן כדי ללמד אותך מסחר אחראי — ניהול סיכונים, משמעת ופסיכולוגיה. "
        "אני לא נותן ייעוץ או איתותי קנייה/מכירה. נסה לשאול למשל: 'מה זה stop-loss?' "
        "או 'איך אני נמנע ממסחר נקמה?'."
    )
