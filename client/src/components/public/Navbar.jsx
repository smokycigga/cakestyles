import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { ShoppingBag, Menu as MenuIcon, X } from "lucide-react";
import { useCart } from "../../store/CartContext";
import CakeStylesLogo from "./CakeStylesLogo";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/custom-cakes", label: "Custom Cakes" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const { totalItems } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 h-[58px] bg-[#fff9fa]/85 backdrop-blur-[14px] border-b border-[#461220]/12 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="flex items-center gap-2 group" aria-label="Cakestyles Home">
            <CakeStylesLogo className="h-6 sm:h-7 w-auto text-[#9D182B]" />
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `text-[10.5px] uppercase tracking-[0.15em] font-semibold transition-colors ${
                    isActive ? "text-[#461220]" : "text-[#70293b]/80 hover:text-[#c88242]"
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
              className="relative p-2 rounded-full hover:bg-[#eed3db]/30 transition-colors"
              aria-label="Cart"
            >
              <ShoppingBag className="w-4 h-4 text-[#461220]" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#461220] text-white text-[9.5px] font-bold flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Link>
            <Link
              to="/menu"
              className="hidden sm:inline-flex text-[11px] uppercase tracking-wider font-bold px-4 py-1.5 rounded-full bg-[#461220] text-white hover:bg-[#340d18] shadow-sm shadow-[#461220]/20 transition-all"
            >
              Order Now
            </Link>
            <button
              className="md:hidden p-2 rounded-full hover:bg-[#eed3db]/30 text-[#461220]"
              onClick={() => setOpen(!open)}
              aria-label="Menu"
            >
              {open ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden py-4 px-2 flex flex-col gap-1 bg-[#fff9fa]/95 backdrop-blur-xl border-b border-[#461220]/10 rounded-b-2xl shadow-xl">
            {[...links, { to: "/track", label: "Track Order" }].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-xl text-xs uppercase tracking-wider font-semibold ${
                    isActive ? "bg-[#eed3db]/50 text-[#461220]" : "text-[#70293b]"
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
