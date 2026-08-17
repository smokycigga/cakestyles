import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Cart is variant/add-on aware and persisted to localStorage so a WhatsApp
// visitor who refreshes doesn't lose their basket.
const CartContext = createContext(null);

const key = (item) =>
  `${item.productId}|${item.variantName || ""}|${(item.addOns || []).map((a) => a.name).sort().join(",")}`;

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cs_cart") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("cs_cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item) => {
    setCart((prev) => {
      const k = key(item);
      const existing = prev.find((i) => key(i) === k);
      if (existing) {
        return prev.map((i) => (key(i) === k ? { ...i, quantity: i.quantity + item.quantity } : i));
      }
      return [...prev, item];
    });
  };

  const setQuantity = (k, quantity) => {
    setCart((prev) =>
      quantity <= 0 ? prev.filter((i) => key(i) !== k) : prev.map((i) => (key(i) === k ? { ...i, quantity } : i))
    );
  };

  const removeItem = (k) => setCart((prev) => prev.filter((i) => key(i) !== k));
  const clearCart = () => setCart([]);

  const value = useMemo(() => {
    const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = cart.reduce(
      (s, i) => s + (i.unitPrice + (i.addOns || []).reduce((a, x) => a + x.price, 0)) * i.quantity,
      0
    );
    return {
      cart,
      addToCart,
      setQuantity,
      removeItem,
      clearCart,
      totalItems,
      totalPrice,
      itemKey: key,
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => useContext(CartContext);
