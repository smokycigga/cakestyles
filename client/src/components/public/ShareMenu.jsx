import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, Check } from "lucide-react";

// Menu share sheet: copy link + QR download. The URL stays stable regardless
// of menu content changes (PRD §8.2).
export default function ShareMenu({ open, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/menu` : "";

  useEffect(() => {
    if (open && url) {
      QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#6d2141", light: "#fffcf8" } })
        .then(setDataUrl)
        .catch(() => setDataUrl(""));
    }
  }, [open, url]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cocoa-900/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-wine-800">Share our menu</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-wine-50" aria-label="Close">
            <X className="w-5 h-5 text-cocoa-500" />
          </button>
        </div>

        {dataUrl && (
          <>
            <img src={dataUrl} alt="Menu QR code" className="w-48 h-48 mx-auto rounded-xl border border-wine-100" />
            <a
              href={dataUrl}
              download="cakestyles-menu-qr.png"
              className="mt-4 inline-block text-sm font-medium px-4 py-2 rounded-full bg-wine-600 text-white hover:bg-wine-700"
            >
              Download QR
            </a>
          </>
        )}

        <div className="mt-5 flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 min-w-0 text-xs bg-cream-100 border border-wine-100 rounded-lg px-3 py-2 text-cocoa-700"
          />
          <button
            onClick={copy}
            className="p-2 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50"
            aria-label="Copy link"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-cocoa-500 mt-2">Print the QR for your counter — it always opens the live menu.</p>
      </div>
    </div>
  );
}
