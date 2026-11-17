import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { filterBySearch } from "../../lib/search";

/**
 * Searchable product picker for the manual-order screen.
 *
 * This used to be a native <select>. A select's type-ahead only matches from
 * the very beginning of the option label, so "truffle" would not reach
 * "Chocolate Truffle Cake" and a typo left you scrolling. A real search box
 * with the shared matcher fixes both, and it works the same for the B2B list.
 *
 * `renderMeta(product)` supplies the right-hand price hint.
 */
export default function ProductPicker({ products, label, emptyLabel, renderMeta, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const results = useMemo(() => filterBySearch(products, query), [products, query]);

  // Close on outside click — a click elsewhere means the user moved on.
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the box the moment the panel opens: the whole point is to type.
  useEffect(() => {
    if (open) {
      setCursor(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setQuery("");
  }, [open]);

  const choose = (product) => {
    if (!product) return;
    onPick(product);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[cursor]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 border border-wine-100 rounded-xl px-3 py-2 text-sm bg-white text-cocoa-700 hover:bg-wine-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" /> {label}
        <ChevronDown className="w-3.5 h-3.5 text-cocoa-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-wine-100 bg-white shadow-xl">
          <div className="relative p-2 border-b border-wine-50">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search products…"
              className="w-full rounded-xl border border-wine-100 py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-cocoa-400">{emptyLabel}</p>
            ) : (
              results.map((product, index) => (
                <button
                  key={product._id}
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(product)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${
                    index === cursor ? "bg-wine-50 text-wine-800" : "text-cocoa-700"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{product.name}</span>
                    {product.category?.name && (
                      <span className="block text-[11px] text-cocoa-400 truncate">{product.category.name}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-cocoa-400">{renderMeta?.(product) || ""}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
