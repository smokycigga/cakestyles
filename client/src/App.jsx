import { Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
import { lazyRoute } from "./lib/lazyRoute";

import Home from "./pages/Home";
import Menu from "./pages/Menu";

// Only the two browsing pages are in the first bundle. Everything else — the
// checkout form, the framer-motion about page, the QR share sheet, the invoice
// PDF tooling — is split into its own chunk and fetched when it is opened, so a
// visitor reading the home page on a phone no longer downloads the whole shop.
//
// lazyRoute, not lazy: a tab left open across a deploy asks for a chunk hash
// that no longer exists, and the plain import rejects and blanks the screen.
// lazyRoute reloads once to pick up the new hashes (see lib/lazyRoute.js).
const ProductDetail = lazyRoute(() => import("./pages/ProductDetail"));
const CustomCakes = lazyRoute(() => import("./pages/CustomCakes"));
const About = lazyRoute(() => import("./pages/About"));
const Contact = lazyRoute(() => import("./pages/Contact"));
const Cart = lazyRoute(() => import("./pages/Cart"));
const Checkout = lazyRoute(() => import("./pages/Checkout"));
const OrderConfirmation = lazyRoute(() => import("./pages/OrderConfirmation"));
const Track = lazyRoute(() => import("./pages/Track"));

// The admin section is code-split so public storefront visitors never pay for
// the admin pages on first load. Each admin route loads its chunk on demand.
const AdminLogin = lazyRoute(() => import("./pages/admin/Login"));
const AdminLayout = lazyRoute(() => import("./components/admin/Layout"));
const Dashboard = lazyRoute(() => import("./pages/admin/Dashboard"));
const Orders = lazyRoute(() => import("./pages/admin/Orders"));
const OrderDetail = lazyRoute(() => import("./pages/admin/OrderDetail"));
const ManualOrder = lazyRoute(() => import("./pages/admin/ManualOrder"));
const Products = lazyRoute(() => import("./pages/admin/Products"));
const ProductForm = lazyRoute(() => import("./pages/admin/ProductForm"));
const B2BCatalogue = lazyRoute(() => import("./pages/admin/B2BCatalogue"));
const MenuManager = lazyRoute(() => import("./pages/admin/MenuManager"));
const Customers = lazyRoute(() => import("./pages/admin/Customers"));
const CustomerDetail = lazyRoute(() => import("./pages/admin/CustomerDetail"));
const CRM = lazyRoute(() => import("./pages/admin/CRM"));
const Tasks = lazyRoute(() => import("./pages/admin/Tasks"));
const Campaigns = lazyRoute(() => import("./pages/admin/Campaigns"));
const Enquiries = lazyRoute(() => import("./pages/admin/Enquiries"));
const Invoices = lazyRoute(() => import("./pages/admin/Invoices"));
const InvoiceDetail = lazyRoute(() => import("./pages/admin/InvoiceDetail"));
const Expenses = lazyRoute(() => import("./pages/admin/Expenses"));
const Reports = lazyRoute(() => import("./pages/admin/Reports"));
const Settings = lazyRoute(() => import("./pages/admin/Settings"));
const Users = lazyRoute(() => import("./pages/admin/Users"));
const AuditLog = lazyRoute(() => import("./pages/admin/AuditLog"));

import Navbar from "./components/public/Navbar";
import Footer from "./components/public/Footer";
import { useAuth } from "./store/AuthContext";

const AdminFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-cream-50">
    <div className="flex items-center gap-3 text-wine-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-wine-300 border-t-wine-700" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  </div>
);

const PublicFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-wine-200 border-t-wine-700" />
  </div>
);

const PublicShell = ({ children, hideFooter = false }) => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">
      {/* Navbar and footer render immediately; only the page body waits for its
          chunk, so a lazy route never blanks the whole screen. */}
      <Suspense fallback={<PublicFallback />}>{children}</Suspense>
    </main>
    {!hideFooter && <Footer />}
  </div>
);

const AdminGuard = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return children;
};

export default function App() {
  return (
    <ChunkErrorBoundary>
      <Routes>
        {/* Public website */}
        <Route path="/" element={<PublicShell hideFooter><Home /></PublicShell>} />
        <Route path="/menu" element={<PublicShell><Menu /></PublicShell>} />
        <Route path="/menu/product/:slug" element={<PublicShell><ProductDetail /></PublicShell>} />
        <Route path="/custom-cakes" element={<PublicShell><CustomCakes /></PublicShell>} />
        <Route path="/about" element={<PublicShell><About /></PublicShell>} />
        <Route path="/contact" element={<PublicShell><Contact /></PublicShell>} />
        <Route path="/cart" element={<PublicShell><Cart /></PublicShell>} />
        <Route path="/checkout" element={<PublicShell><Checkout /></PublicShell>} />
        <Route path="/order-confirmed/:orderNumber" element={<PublicShell><OrderConfirmation /></PublicShell>} />
        <Route path="/track" element={<PublicShell><Track /></PublicShell>} />

        {/* Admin */}
        <Route path="/admin/login" element={<Suspense fallback={<AdminFallback />}><AdminLogin /></Suspense>} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <Suspense fallback={<AdminFallback />}>
                <AdminLayout />
              </Suspense>
            </AdminGuard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/new" element={<ManualOrder />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductForm />} />
          <Route path="products/:id" element={<ProductForm />} />
          <Route path="b2b" element={<B2BCatalogue />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="crm" element={<CRM />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="enquiries" element={<Enquiries />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ChunkErrorBoundary>
  );
}
