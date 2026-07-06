import { Icon } from "./Icon";

export function ModulePlaceholder({ icon, title, intro, points }: {
  icon: string; title: string; intro: string; points: string[];
}) {
  return (
    <div className="card p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="grid place-items-center w-11 h-11 rounded-xl" style={{ background: "var(--surface-2)", color: "var(--brand)" }}>
          <Icon name={icon} size={22} />
        </div>
        <div>
          <div className="font-extrabold text-lg">{title}</div>
          <div className="chip chip-brand text-[11px]">מודול עתידי · הארכיטקטורה מוכנה</div>
        </div>
      </div>
      <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>{intro}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2"><span style={{ color: "var(--brand)" }}>•</span>{p}</li>
        ))}
      </ul>
      <p className="text-xs mt-4" style={{ color: "var(--text-mute)" }}>
        מודול זה נבנה כיחידה נפרדת (integration/module) שתתחבר למערכת דרך שכבת הנתונים המשותפת,
        ללא שינוי במסכי הליבה — לפי סדר העדיפויות שהוגדר.
      </p>
    </div>
  );
}
