import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import { Instagram } from "./icons";
import { useSettings } from "../../store/SettingsContext";
import CakeStylesLogo from "./CakeStylesLogo";

export default function Footer() {
  const settings = useSettings();
  const store = settings?.store || {};

  return (
    <footer className="bg-wine-900 text-blush-100 mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <CakeStylesLogo className="h-8 w-auto text-white mb-3" />
          <p className="text-sm text-blush-200/80 leading-relaxed">
            {store.tagline || "Handcrafted cakes & bakes, made for your celebrations."}
          </p>
        </div>

        <div>
          <h4 className="text-white font-medium text-sm tracking-wide uppercase mb-3">Explore</h4>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/menu">Menu</Link></li>
            <li><Link className="hover:text-white" to="/custom-cakes">Custom Cakes</Link></li>
            <li><Link className="hover:text-white" to="/track">Track Order</Link></li>
            <li><Link className="hover:text-white" to="/about">About Us</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-medium text-sm tracking-wide uppercase mb-3">Visit Us</h4>
          <ul className="space-y-2 text-sm text-blush-200/80">
            {store.address?.line1 && (
              <li className="flex gap-2 items-start">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{[store.address.line1, store.address.city, store.address.pincode].filter(Boolean).join(", ")}</span>
              </li>
            )}
            {(store.hours || []).map((h, i) => (
              <li key={i}>{h.days}: {h.open} – {h.close}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-medium text-sm tracking-wide uppercase mb-3">Contact</h4>
          <ul className="space-y-2 text-sm">
            {store.phone && (
              <li className="flex gap-2 items-center">
                <Phone className="w-4 h-4" /> {store.phone}
              </li>
            )}
            {store.email && (
              <li className="flex gap-2 items-center">
                <Mail className="w-4 h-4" /> {store.email}
              </li>
            )}
            {store.instagram && (
              <li>
                <a
                  className="flex gap-2 items-center hover:text-white"
                  href={`https://instagram.com/${String(store.instagram).replace("@", "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Instagram className="w-4 h-4" /> {store.instagram}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-wine-800 py-4 text-center text-xs text-blush-200/60">
        © {new Date().getFullYear()} {store.name || "Cakestyles"}. 100% veg & eggless. Made fresh to order.
      </div>
    </footer>
  );
}
