import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import "./index.css";
import App from "./App";
import { CartProvider } from "./store/CartContext";
import { SettingsProvider } from "./store/SettingsContext";
import { AuthProvider } from "./store/AuthContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <CartProvider>
          <AuthProvider>
            <App />
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: "#6d2141",
                  color: "#fff",
                  fontSize: "14px",
                  borderRadius: "12px",
                },
              }}
            />
          </AuthProvider>
        </CartProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
);
