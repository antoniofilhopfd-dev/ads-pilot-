import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const TONES = {
  ok: "bg-[#e3f5ee] text-ok",
  warn: "bg-[#fbf1dc] text-[#7a5200]",
  danger: "bg-[#fbe5e5] text-danger",
  neutral: "bg-[#eef0f5] text-muted",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const cls = { error: "border-danger/30 bg-[#fbe5e5] text-danger", success: "border-ok/30 bg-[#e3f5ee] text-ok", info: "border-line bg-canvas text-muted" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:border-violet";

export function Field({ label, name, id = name, type = "text", autoComplete, defaultValue, hint, required = true }: { label: string; name: string; id?: string; type?: string; autoComplete?: string; defaultValue?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} defaultValue={defaultValue} required={required} aria-describedby={hint ? `${id}-hint` : undefined} className={inputCls} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export const btnCls = {
  primary: "inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-navy disabled:opacity-60",
  secondary: "inline-flex items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-canvas disabled:opacity-60",
  danger: "inline-flex items-center justify-center rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-[#fbe5e5] disabled:opacity-60",
};

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={`border-b border-line px-3 py-2 text-xs font-medium text-muted ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
export function Td({ children, right, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={`border-b border-line px-3 py-3 ${right ? "text-right num" : ""} ${className}`}>{children}</td>;
}
