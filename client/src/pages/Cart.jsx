import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "../store/CartContext";
import { inr } from "../lib/format";

export default function Cart() {
  const { cart, setQuantity, removeItem, totalPrice, itemKey } = useCart();
  const navigate = useNavigate();

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-wine-50 flex items-center justify-center mb-4">
          <ShoppingBag className="w-7 h-7 text-wine-500" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-wine-800">Your cart is empty</h1>
        <p className="text-sm text-cocoa-500 mt-2">Something sweet is waiting for you on the menu.</p>
        <Link to="/menu" className="mt-6 inline-flex items-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full">
          Browse Menu <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-semibold text-wine-800 mb-6">Your Cart</h1>

      <div className="space-y-3">
        {cart.map((item) => {
          const k = itemKey(item);
          const addOnSum = (item.addOns || []).reduce((s, a) => s + a.price, 0);
          return (
            <div key={k} className="bg-white rounded-2xl border border-wine-100 p-4 flex gap-4">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-wine-100 to-blush-200 shrink-0 flex items-center justify-center">
                  <span className="font-display text-xl text-wine-700/60">{item.name[0]}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-cocoa-900 truncate">{item.name}</h3>
                    {item.variantName && <p className="text-xs text-cocoa-500">{item.variantName}</p>}
                    {(item.addOns || []).length > 0 && (
                      <p className="text-xs text-wine-600 mt-0.5">
                        + {item.addOns.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {item.notes && <p className="text-xs italic text-cocoa-400 mt-0.5 truncate">"{item.notes}"</p>}
                  </div>
                  <button onClick={() => removeItem(k)} className="p-1.5 rounded-full hover:bg-rose-50 text-cocoa-400 hover:text-rose-600" aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center border border-wine-100 rounded-full">
                    <button onClick={() => setQuantity(k, item.quantity - 1)} className="p-1.5 hover:bg-wine-50 rounded-l-full" aria-label="Decrease">
                      <Minus className="w-3.5 h-3.5 text-wine-700" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => setQuantity(k, item.quantity + 1)} className="p-1.5 hover:bg-wine-50 rounded-r-full" aria-label="Increase">
                      <Plus className="w-3.5 h-3.5 text-wine-700" />
                    </button>
                  </div>
                  <span className="font-semibold text-wine-700">
                    {inr((item.unitPrice + addOnSum) * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-wine-100 p-5">
        <div className="flex items-center justify-between text-sm text-cocoa-500">
          <span>Subtotal</span>
          <span>{inr(totalPrice)}</span>
        </div>
        <div className="flex items-center justify-between text-cocoa-400 text-xs mt-1">
          <span>Delivery / taxes</span>
          <span>calculated at checkout</span>
        </div>
        <div className="flex items-center justify-between font-semibold text-cocoa-900 text-base mt-3 pt-3 border-t border-wine-100">
          <span>Total</span>
          <span className="text-wine-700">{inr(totalPrice)}+</span>
        </div>
        <button
          onClick={() => navigate("/checkout")}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-wine-700 hover:bg-wine-800 text-white font-medium px-6 py-3 rounded-full transition-colors"
        >
          Proceed to Checkout <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
