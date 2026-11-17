/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);

// Half a cake is a real order, so quantities are not integers. Three decimals
// is finer than any bakery scale, and stops 0.1 + 0.2 turning into 0.30000000000000004.
export const QUANTITY_STEP = 0.5;
export const roundQuantity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/** Clamp anything the UI can produce into a usable line quantity. */
export const normalizeQuantity = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return roundQuantity(parsed);
};

const key = (item) => {
  const addOnNames = (item.addOns || []).map((addOn) => addOn.name).sort();
  return `${item.productId}|${item.variantName || ""}|${addOnNames.join(",")}|${item.notes || ""}`;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("cs_cart") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cs_cart", JSON.stringify(cart));
    } catch {
      // The cart still works in memory when storage is unavailable.
    }
  }, [cart]);

  const addToCart = (item) => {
    setCart((current) => {
      const itemKey = key(item);
      const existing = current.find((entry) => key(entry) === itemKey);
      if (existing) {
        return current.map((entry) =>
          key(entry) === itemKey
            ? { ...entry, quantity: roundQuantity(entry.quantity + normalizeQuantity(item.quantity)) }
            : entry,
        );
      }
      return [...current, { ...item, quantity: normalizeQuantity(item.quantity) }];
    });
  };

  // A line is dropped only when the quantity reaches zero. Anything else —
  // including 0.5 — stays in the cart.
  const setQuantity = (itemKey, quantity) => {
    const next = Number(quantity);
    setCart((current) =>
      !Number.isFinite(next) || next <= 0
        ? current.filter((entry) => key(entry) !== itemKey)
        : current.map((entry) =>
            key(entry) === itemKey ? { ...entry, quantity: roundQuantity(next) } : entry,
          ),
    );
  };

  const removeItem = (itemKey) => setCart((current) => current.filter((entry) => key(entry) !== itemKey));
  const clearCart = () => setCart([]);

  const value = useMemo(() => {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce(
      (sum, item) => sum + (item.unitPrice + (item.addOns || []).reduce((addOnSum, addOn) => addOnSum + addOn.price, 0)) * item.quantity,
      0,
    );
    return { cart, addToCart, setQuantity, removeItem, clearCart, totalItems, totalPrice, itemKey: key };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => useContext(CartContext);
