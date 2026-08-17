import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { ShoppingBag, Menu as MenuIcon, X } from "lucide-react";
import { useCart } from "../../store/CartContext";
import { useSettings } from "../../store/SettingsContext";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/custom-cakes", label: "Custom Cakes" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const { totalItems } = useCart();
  const settings = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-cream-50/90 backdrop-blur border-b border-wine-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold text-wine-700">
              {settings?.store?.name || "Cakestyles"}
            </span>
            <span className="hidden sm:inline text-[10px] tracking-[0.25em] uppercase text-wine-400">
              bakery studio
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? "text-wine-700" : "text-cocoa-500 hover:text-wine-600"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/cart"
              className="relative p-2 rounded-full hover:bg-wine-50 transition-colors"
              aria-label="Cart"
            >
              <ShoppingBag className="w-5 h-5 text-wine-700" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-wine-600 text-white text-[11px] font-semibold flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Link>
            <Link
              to="/track"
              className="hidden sm:inline-flex text-sm font-medium px-4 py-2 rounded-full border border-wine-200 text-wine-700 hover:bg-wine-50 transition-colors"
            >
              Track Order
            </Link>
            <button
              className="md:hidden p-2 rounded-full hover:bg-wine-50"
              onClick={() => setOpen(!open)}
              aria-label="Menu"
            >
              {open ? <X className="w-5 h-5 text-wine-700" /> : <MenuIcon className="w-5 h-5 text-wine-700" />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden pb-4 flex flex-col gap-1">
            {[...links, { to: "/track", label: "Track Order" }].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive ? "bg-wine-50 text-wine-700" : "text-cocoa-500"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
