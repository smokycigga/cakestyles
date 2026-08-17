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

import AdminLogin from "./pages/admin/Login";
import AdminLayout from "./components/admin/Layout";
import Dashboard from "./pages/admin/Dashboard";
import Orders from "./pages/admin/Orders";
import OrderDetail from "./pages/admin/OrderDetail";
import ManualOrder from "./pages/admin/ManualOrder";
import Products from "./pages/admin/Products";
import ProductForm from "./pages/admin/ProductForm";
import MenuManager from "./pages/admin/MenuManager";
import Customers from "./pages/admin/Customers";
import CustomerDetail from "./pages/admin/CustomerDetail";
import Enquiries from "./pages/admin/Enquiries";
import Invoices from "./pages/admin/Invoices";
import InvoiceDetail from "./pages/admin/InvoiceDetail";
import Expenses from "./pages/admin/Expenses";
import Reports from "./pages/admin/Reports";
import Settings from "./pages/admin/Settings";
import Users from "./pages/admin/Users";
import AuditLog from "./pages/admin/AuditLog";

import Navbar from "./components/public/Navbar";
import Footer from "./components/public/Footer";
import { useAuth } from "./store/AuthContext";

const PublicShell = ({ children }) => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
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
      <Route path="/" element={<PublicShell><Home /></PublicShell>} />
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
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminLayout />
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
