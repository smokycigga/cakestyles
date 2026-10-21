import { useState } from "react";
import { X, Loader2 } from "lucide-react";

// Small shared kit for admin screens — keeps every page consistent.

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
    <div>
      <h1 className="font-display text-2xl font-semibold text-cocoa-900">{title}</h1>
      {subtitle && <p className="text-sm text-cocoa-400 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Badge = ({ className = "", children }) => (
  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${className}`}>
    {children}
  </span>
);

export const StatCard = ({ label, value, sub, tone = "default" }) => {
  const tones = {
    default: "bg-white border-wine-100",
    wine: "bg-wine-700 text-white border-wine-700",
    good: "bg-emerald-50 border-emerald-200",
    warn: "bg-amber-50 border-amber-200",
    bad: "bg-rose-50 border-rose-200",
  };
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${tone === "wine" ? "text-blush-200" : "text-cocoa-400"}`}>{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold ${tone === "wine" ? "text-white" : "text-cocoa-900"}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${tone === "wine" ? "text-blush-200/80" : "text-cocoa-400"}`}>{sub}</div>}
    </div>
  );
};

export const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-6 h-6 text-wine-500 animate-spin" />
  </div>
);

export const EmptyState = ({ icon = "🍰", title, hint }) => (
  <div className="text-center py-14">
    <div className="text-4xl mb-2">{icon}</div>
    <p className="text-sm font-medium text-cocoa-600">{title}</p>
    {hint && <p className="text-xs text-cocoa-400 mt-1">{hint}</p>}
  </div>
);

export const Modal = ({ open, onClose, title, children, wide = false }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-cocoa-900/50 overflow-y-auto" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} my-8 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-wine-100">
          <h3 className="font-display text-lg font-semibold text-cocoa-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-wine-50" aria-label="Close">
            <X className="w-5 h-5 text-cocoa-400" />
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const inputCls =
  "w-full border border-wine-100 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100 bg-white";

export const Field = ({ label, hint, children, span }) => (
  <label className={`block ${span === 2 ? "sm:col-span-2" : ""}`}>
    <span className="text-xs font-medium text-cocoa-600">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="text-[11px] text-cocoa-400 mt-1 block">{hint}</span>}
  </label>
);

export const Button = ({ variant = "primary", className = "", children, ...props }) => {
  const variants = {
    primary: "bg-wine-700 hover:bg-wine-800 text-white",
    outline: "border border-wine-200 hover:bg-wine-50 text-wine-700",
    ghost: "hover:bg-wine-50 text-cocoa-500",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 font-medium text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const ConfirmButton = ({ onConfirm, children, confirmLabel = "Confirm?", className = "", ...props }) => {
  const [arming, setArming] = useState(false);
  return (
    <button
      className={className}
      onClick={() => (arming ? onConfirm() : setArming(true))}
      onBlur={() => setArming(false)}
      {...props}
    >
      {arming ? confirmLabel : children}
    </button>
  );
};

export const TableWrap = ({ children }) => (
  <div className="table-card bg-white rounded-2xl border border-wine-100 overflow-x-auto">
    <table className="w-full text-sm">{children}</table>
  </div>
);

export const Th = ({ children, className = "" }) => (
  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-cocoa-400 border-b border-wine-100 whitespace-nowrap ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = "", label = "" }) => (
  <td className={`px-4 py-3 border-b border-wine-50 align-middle ${className}`} data-label={label}>{children}</td>
);
