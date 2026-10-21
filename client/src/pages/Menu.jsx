import { useEffect, useMemo, useState } from "react";
import { Search, Share2, SlidersHorizontal, Store, Truck } from "lucide-react";
import api from "../lib/api";
import ProductCard from "../components/public/ProductCard";
import ShareMenu from "../components/public/ShareMenu";
import FulfilmentChoiceModal from "../components/public/FulfilmentChoiceModal";
import { useFulfilment } from "../store/FulfilmentContext";
import { categoryChips, groupByCategoryOrder } from "../lib/catalog";

export default function Menu() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [fulfilmentOpen, setFulfilmentOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { type, address } = useFulfilment();

  useEffect(() => {
    document.title = "Menu — Cakestyles";
    let active = true;
    setLoading(true);

    // Categories only drive chip order and section headings. Losing them is
    // survivable, so a failure there must not blank the menu.
    Promise.allSettled([api.get("/products"), api.get("/categories")]).then(([productsResult, categoriesResult]) => {
      if (!active) return;
      if (productsResult.status === "fulfilled") {
        setProducts(productsResult.value.data.products || []);
        setError("");
      } else {
        setError("We couldn’t load the menu. Please check your connection and try again.");
      }
      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value.data.categories || []);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Fall back to deriving categories from the products when the categories
  // request failed, so the menu still renders.
  const orderedCategories = useMemo(() => {
    if (categories.length > 0) return categories;
    const seen = new Map();
    for (const product of products) {
      if (product.category?.slug && !seen.has(product.category.slug)) seen.set(product.category.slug, product.category);
    }
    return [...seen.values()];
  }, [categories, products]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (activeCat !== "all" && product.category?.slug !== activeCat) return false;
      if (!query) return true;
      return [product.name, product.shortDescription, ...(product.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeCat, products, search]);

  // Only offer a chip for a category that actually has products behind it.
  const chips = useMemo(() => categoryChips(orderedCategories, products), [orderedCategories, products]);

  const sections = useMemo(() => {
    if (activeCat !== "all" || search.trim()) {
      const name = search.trim()
        ? "Search results"
        : orderedCategories.find((category) => category.slug === activeCat)?.name || "Menu";
      return [{ slug: "results", name, products: filtered }];
    }
    return groupByCategoryOrder(filtered, orderedCategories);
  }, [activeCat, filtered, orderedCategories, search]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-wine-500">Fresh today</p>
          <h1 className="font-display text-4xl font-semibold text-wine-800">Our menu</h1>
        </div>
        <button onClick={() => setShareOpen(true)} className="rounded-full border border-wine-100 bg-white p-3 text-wine-700 shadow-sm transition hover:border-wine-300" aria-label="Share menu">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={() => setFulfilmentOpen(true)}
        className="mb-5 flex w-full items-center justify-between rounded-2xl border border-wine-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-wine-300"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wine-50 text-wine-700">
            {type === "delivery" ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-wine-600">{type === "delivery" ? "Delivery" : "Self pickup"}</span>
            <span className="block max-w-[16rem] truncate text-xs text-cocoa-500">
              {type === "delivery" ? address.line1 || "Add delivery address" : "Choose a pickup slot with your item"}
            </span>
          </span>
        </span>
        <span className="text-xs font-semibold text-wine-700">Change</span>
      </button>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cocoa-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cakes, brownies, pastries…" className="w-full rounded-full border border-wine-100 bg-white py-3 pl-11 pr-12 text-sm outline-none transition focus:border-wine-400 focus:ring-2 focus:ring-wine-100" />
        <SlidersHorizontal className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-wine-600" />
      </div>

      <div className="sticky top-16 z-30 -mx-4 mb-7 border-b border-wine-100 bg-cream-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button onClick={() => setActiveCat("all")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${activeCat === "all" ? "bg-wine-800 text-white" : "border border-wine-100 bg-white text-cocoa-600"}`}>All</button>
          {chips.map((category) => (
            <button key={category.slug} onClick={() => setActiveCat(category.slug)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${activeCat === category.slug ? "bg-wine-800 text-white" : "border border-wine-100 bg-white text-cocoa-600"}`}>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(5)].map((_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-wine-50" />)}</div>
      ) : error ? (
        <div className="rounded-3xl border border-wine-100 bg-white px-6 py-12 text-center">
          <p className="text-sm text-cocoa-500">{error}</p>
          <button onClick={() => { setLoading(true); setReloadKey((value) => value + 1); }} className="mt-5 rounded-full bg-wine-700 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center"><div className="mb-3 text-4xl">🍰</div><p className="text-sm text-cocoa-500">No treats matched your search.</p></div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.slug}>
              <div className="mb-4 flex items-end justify-between border-b border-wine-100 pb-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-wine-400">Cakestyles</p><h2 className="font-display text-2xl font-semibold text-wine-800">{section.name}</h2></div>
                <span className="text-xs text-cocoa-400">{section.products.length} items</span>
              </div>
              <div className="space-y-4">{section.products.map((product) => <ProductCard key={product._id} product={product} layout="list" />)}</div>
            </section>
          ))}
        </div>
      )}

      <ShareMenu open={shareOpen} onClose={() => setShareOpen(false)} />
      <FulfilmentChoiceModal open={fulfilmentOpen} onClose={() => setFulfilmentOpen(false)} />
    </div>
  );
}
