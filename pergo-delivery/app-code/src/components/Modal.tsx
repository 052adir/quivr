"use client";

import { Icon } from "./Icon";

export function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(17,24,39,.45)" }} />
      <div
        className="relative w-full sm:max-w-lg card p-5 max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-lg">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {children}
        {footer && <div className="flex gap-2 mt-5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
