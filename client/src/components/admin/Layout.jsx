import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingBag, Cake, LayoutGrid, Users, MessageSquareHeart,
  Receipt, Wallet, FileBarChart, Settings, ShieldCheck, LogOut, Menu as MenuIcon, X,
  ContactRound, ClipboardCheck, Megaphone,
} from "lucide-react";
import { useAuth } from "../../store/AuthContext";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/products", label: "Products", icon: Cake },
  { to: "/admin/menu", label: "Menu", icon: LayoutGrid },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/crm", label: "CRM", icon: ContactRound },
  { to: "/admin/tasks", label: "Tasks", icon: ClipboardCheck },
  { to: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/admin/enquiries", label: "Enquiries", icon: MessageSquareHeart },
  { to: "/admin/invoices", label: "Invoices", icon: Receipt },
  { to: "/admin/expenses", label: "Expenses", icon: Wallet },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const navItems = NAV.filter((n) => n.to !== "/admin/settings" || can("settings:write") || user?.role === "manager" || user?.role === "staff" || user?.role === "accounts");

  return (
    <div className="min-h-screen bg-cream-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 z-40 h-screen w-64 bg-wine-900 text-blush-100 flex flex-col shrink-0 transition-transform ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 border-b border-wine-800 flex items-center justify-between">
          <div>
            <div className="font-display text-xl font-semibold text-white">Cakestyles</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-blush-300/60">Admin Studio</div>
          </div>
          <button className="lg:hidden p-1" onClick={() => setOpen(false)} aria-label="Close sidebar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? "bg-wine-700 text-white" : "text-blush-200/80 hover:bg-wine-800 hover:text-white"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </NavLink>
          ))}

          {can("users:manage") && (
            <NavLink
              to="/admin/users"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? "bg-wine-700 text-white" : "text-blush-200/80 hover:bg-wine-800 hover:text-white"
                }`
              }
            >
              <ShieldCheck className="w-4 h-4" /> Users
            </NavLink>
          )}

          {can("audit:read") && (
            <NavLink
              to="/admin/audit"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? "bg-wine-700 text-white" : "text-blush-200/80 hover:bg-wine-800 hover:text-white"
                }`
              }
            >
              <ShieldCheck className="w-4 h-4" /> Audit Log
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-wine-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-wine-700 flex items-center justify-center text-sm font-semibold text-white">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-blush-300/60 capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-blush-200/80 hover:bg-wine-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-cocoa-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="lg:hidden sticky top-0 z-20 bg-wine-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="font-display font-semibold">Cakestyles Admin</div>
          <button onClick={() => setOpen(true)} aria-label="Open sidebar">
            <MenuIcon className="w-5 h-5" />
          </button>
        </div>
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
