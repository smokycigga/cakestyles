import { useEffect, useState } from "react";
import { Phone, Mail, MapPin, Clock3, Send } from "lucide-react";
import { Instagram } from "../components/public/icons";
import { useSettings } from "../store/SettingsContext";

export default function Contact() {
  const settings = useSettings();
  const store = settings?.store || {};
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = "Contact — Cakestyles";
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-display text-4xl font-semibold text-wine-800 text-center">Visit / Contact Us</h1>
      <p className="text-sm text-cocoa-500 text-center mt-2">
        We'd love to hear about your celebration. Walk in, call, or drop a message.
      </p>

      <div className="grid md:grid-cols-2 gap-6 mt-10">
        <div className="space-y-4">
          {store.address?.line1 && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-wine-600" />
              </div>
              <div>
                <h3 className="font-medium text-cocoa-900 text-sm">Studio Address</h3>
                <p className="text-sm text-cocoa-500 mt-1">
                  {store.address.line1}
                  {store.address.city && `, ${store.address.city}`} {store.address.pincode}
                </p>
              </div>
            </div>
          )}

          {(store.hours || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
                <Clock3 className="w-5 h-5 text-wine-600" />
              </div>
              <div>
                <h3 className="font-medium text-cocoa-900 text-sm">Opening Hours</h3>
                <div className="text-sm text-cocoa-500 mt-1 space-y-0.5">
                  {(store.hours || []).map((h, i) => (
                    <p key={i}>{h.days}: {h.open} – {h.close}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-wine-100 p-5 flex gap-4">
            <div className="w-10 h-10 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-wine-600" />
            </div>
            <div>
              <h3 className="font-medium text-cocoa-900 text-sm">Call / WhatsApp</h3>
              <p className="text-sm text-cocoa-500 mt-1">{store.phone || "—"}</p>
            </div>
          </div>

          {store.email && (
            <div className="bg-white rounded-2xl border border-wine-100 p-5 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-wine-600" />
              </div>
              <div>
                <h3 className="font-medium text-cocoa-900 text-sm">Email</h3>
                <p className="text-sm text-cocoa-500 mt-1">{store.email}</p>
              </div>
            </div>
          )}

          {store.instagram && (
            <a
              href={`https://instagram.com/${String(store.instagram).replace("@", "")}`}
              target="_blank"
              rel="noreferrer"
              className="bg-white rounded-2xl border border-wine-100 p-5 flex gap-4 hover:border-wine-300 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-wine-50 flex items-center justify-center shrink-0">
                <Instagram className="w-5 h-5 text-wine-600" />
              </div>
              <div>
                <h3 className="font-medium text-cocoa-900 text-sm">Instagram</h3>
                <p className="text-sm text-cocoa-500 mt-1">{store.instagram} — see today's bakes</p>
              </div>
            </a>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-wine-100 p-6">
          <h3 className="font-medium text-cocoa-900 mb-4">Send us a message</h3>
          {sent ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">💌</div>
              <p className="text-sm text-cocoa-600">Thanks! We usually reply the same day.</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
              className="space-y-3"
            >
              <input required placeholder="Your name" className="w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400" />
              <input required type="tel" placeholder="Phone" className="w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400" />
              <textarea rows={4} placeholder="Your message…" className="w-full border border-wine-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-wine-400" />
              <button type="submit" className="w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-xl">
                <Send className="w-4 h-4" /> Send Message
              </button>
              <p className="text-[11px] text-cocoa-400 text-center">
                For custom cake orders, use the <a href="/custom-cakes" className="text-wine-600 underline">enquiry form</a> — it captures everything we need.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
