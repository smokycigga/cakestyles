/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);

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
            ? { ...entry, quantity: Math.min(99, entry.quantity + item.quantity) }
            : entry,
        );
      }
      return [...current, { ...item, quantity: Math.min(99, Math.max(1, item.quantity)) }];
    });
  };

  const setQuantity = (itemKey, quantity) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((entry) => key(entry) !== itemKey)
        : current.map((entry) =>
            key(entry) === itemKey ? { ...entry, quantity: Math.min(99, quantity) } : entry,
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
