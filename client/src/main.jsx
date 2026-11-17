import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

// Playfair Display comes from fonts.css as a variable font (one file per style
// covering weights 400-900), so the static @fontsource/playfair-display import
// that used to sit here was loading the same family a second time.
import "@fontsource/great-vibes";
import "./fonts.css";
import "./index.css";
import App from "./App";
import { CartProvider } from "./store/CartContext";
import { SettingsProvider } from "./store/SettingsContext";
import { FulfilmentProvider } from "./store/FulfilmentContext";
import { AuthProvider } from "./store/AuthContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <FulfilmentProvider>
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
        </FulfilmentProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
);
