import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Home from "./pages/Home";
import Menu from "./pages/Menu";
import ProductDetail from "./pages/ProductDetail";
import CustomCakes from "./pages/CustomCakes";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Track from "./pages/Track";

// The admin section is code-split so public storefront visitors never pay for
// the admin pages on first load. Each admin route loads its chunk on demand.
const AdminLogin = lazy(() => import("./pages/admin/Login"));
const AdminLayout = lazy(() => import("./components/admin/Layout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Orders = lazy(() => import("./pages/admin/Orders"));
const OrderDetail = lazy(() => import("./pages/admin/OrderDetail"));
const ManualOrder = lazy(() => import("./pages/admin/ManualOrder"));
const Products = lazy(() => import("./pages/admin/Products"));
const ProductForm = lazy(() => import("./pages/admin/ProductForm"));
const MenuManager = lazy(() => import("./pages/admin/MenuManager"));
const Customers = lazy(() => import("./pages/admin/Customers"));
const CustomerDetail = lazy(() => import("./pages/admin/CustomerDetail"));
const CRM = lazy(() => import("./pages/admin/CRM"));
const Tasks = lazy(() => import("./pages/admin/Tasks"));
const Campaigns = lazy(() => import("./pages/admin/Campaigns"));
const Enquiries = lazy(() => import("./pages/admin/Enquiries"));
const Invoices = lazy(() => import("./pages/admin/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/admin/InvoiceDetail"));
const Expenses = lazy(() => import("./pages/admin/Expenses"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const Users = lazy(() => import("./pages/admin/Users"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));

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

const PublicShell = ({ children, hideFooter = false }) => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
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
  );
}
