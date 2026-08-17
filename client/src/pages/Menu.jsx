import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Share2 } from "lucide-react";
import api from "../lib/api";
import ProductCard from "../components/public/ProductCard";
import ShareMenu from "../components/public/ShareMenu";

// The shareable digital menu (PRD §8.2): category nav, search, badges.
export default function Menu() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    document.title = "Menu — Cakestyles";
    api
      .get("/products")
      .then((r) => setProducts(r.data.products))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const p of products) {
      const c = p.category;
      if (c && !seen.has(c.slug)) seen.set(c.slug, c);
    }
    return [...seen.values()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== "all") list = list.filter((p) => p.category?.slug === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.shortDescription || "").toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [products, activeCat, search]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl font-semibold text-wine-800">Our Menu</h1>
          <p className="text-sm text-cocoa-500 mt-1">Freshly baked, 100% eggless. Order online for pickup or delivery.</p>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-2 border border-wine-200 hover:bg-wine-50 text-wine-700 text-sm font-medium px-4 py-2 rounded-full"
        >
          <Share2 className="w-4 h-4" /> Share Menu
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brownie, cheesecake, tiramisu, cake…"
          className="w-full bg-white border border-wine-100 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-wine-400 focus:ring-2 focus:ring-wine-100"
        />
      </div>

      {/* Category chips */}
      <div className="sticky top-16 z-30 bg-cream-50/95 backdrop-blur py-3 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-wine-100 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveCat("all")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCat === "all" ? "bg-wine-700 text-white" : "bg-white border border-wine-100 text-cocoa-600 hover:border-wine-300"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => setActiveCat(c.slug)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCat === c.slug ? "bg-wine-700 text-white" : "bg-white border border-wine-100 text-cocoa-600 hover:border-wine-300"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-wine-50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">🍰</div>
          <p className="text-cocoa-500">Nothing matched "{search}". Try another craving?</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {filtered.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      )}

      <ShareMenu open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
