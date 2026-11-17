import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Handshake, Search, Save, Sparkles, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import api, { errMsg } from "../../lib/api";
import { inr } from "../../lib/format";
import { filterBySearch } from "../../lib/search";
import { PageHeader, Spinner, Badge, Button, StatCard, inputCls, EmptyState, TableWrap, Th, Td } from "../../components/admin/ui";
import { useAuth } from "../../store/AuthContext";

/**
 * The wholesale catalogue.
 *
 * There is no separate B2B product type — a product is in the wholesale
 * catalogue when it has a b2bPrice, on the product or on any of its variants.
 * That is a good model but a bad thing to manage one product at a time, which
 * is why this page exists: every product in one list, with the wholesale price
 * editable in place and the retail price beside it for comparison.
 *
 * Nothing here is ever shown to a customer: the public endpoints strip
 * b2bPrice from both the product and each variant.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const hasWholesale = (product) =>
  product.b2bPrice != null || (product.variants || []).some((variant) => variant.b2bPrice != null);

// Retail for the product line, and the cheapest wholesale rate it can be sold
// at — the two numbers a wholesale buyer actually asks about.
const retailOf = (product) => Number(product.basePrice) || 0;

const wholesaleFrom = (product, draft) => {
  const rates = [
    draft.b2bPrice === "" || draft.b2bPrice == null ? null : Number(draft.b2bPrice),
    ...(draft.variants || []).map((variant) => (variant.b2bPrice === "" || variant.b2bPrice == null ? null : Number(variant.b2bPrice))),
  ].filter((rate) => rate != null && Number.isFinite(rate));
  return rates.length > 0 ? Math.min(...rates) : null;
};

const draftFrom = (product) => ({
  b2bPrice: product.b2bPrice == null ? "" : String(product.b2bPrice),
  variants: (product.variants || []).map((variant) => ({
    name: variant.name,
    price: variant.price,
    b2bPrice: variant.b2bPrice == null ? "" : String(variant.b2bPrice),
  })),
});

const isDirty = (product, draft) => {
  const saved = draftFrom(product);
  if (saved.b2bPrice !== draft.b2bPrice) return true;
  if (saved.variants.length !== draft.variants.length) return true;
  return saved.variants.some((variant, index) => variant.b2bPrice !== draft.variants[index]?.b2bPrice);
};

export default function B2BCatalogue() {
  const { can } = useAuth();
  const editable = can("catalog:write");

  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | priced | missing
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [expanded, setExpanded] = useState({});
  const [fillPct, setFillPct] = useState("20");
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    api
      .get("/products/admin")
      .then((response) => setProducts(response.data.products))
      .catch((error) => {
        toast.error(errMsg(error));
        setProducts([]);
      });
  }, []);

  const draftFor = (product) => drafts[product._id] || draftFrom(product);

  const setDraft = (product, patch) =>
    setDrafts((current) => ({
      ...current,
      [product._id]: { ...(current[product._id] || draftFrom(product)), ...patch },
    }));

  const setVariantDraft = (product, index, value) => {
    const draft = draftFor(product);
    setDraft(product, {
      variants: draft.variants.map((variant, i) => (i === index ? { ...variant, b2bPrice: value } : variant)),
    });
  };

  const visible = useMemo(() => {
    if (!products) return [];
    const byFilter = products.filter((product) => {
      if (filter === "priced") return hasWholesale(product);
      if (filter === "missing") return !hasWholesale(product);
      return true;
    });
    // Same matcher as everywhere else, so "truf" and "cat" behave here too.
    return filterBySearch(byFilter, search);
  }, [products, filter, search]);

  const stats = useMemo(() => {
    if (!products) return { total: 0, priced: 0, averageDiscount: 0, lowest: null };
    const priced = products.filter(hasWholesale);
    const rates = priced.map((product) => wholesaleFrom(product, draftFrom(product))).filter((rate) => rate != null);
    const discounts = priced
      .map((product) => {
        const retail = retailOf(product);
        const wholesale = wholesaleFrom(product, draftFrom(product));
        return retail > 0 && wholesale != null ? ((retail - wholesale) / retail) * 100 : null;
      })
      .filter((value) => value != null && Number.isFinite(value));
    return {
      total: products.length,
      priced: priced.length,
      averageDiscount: discounts.length ? discounts.reduce((sum, value) => sum + value, 0) / discounts.length : 0,
      lowest: rates.length ? Math.min(...rates) : null,
    };
  }, [products]);

  const save = async (product) => {
    const draft = draftFor(product);
    setSavingId(product._id);
    try {
      const payload = {
        b2bPrice: draft.b2bPrice === "" ? null : Number(draft.b2bPrice),
      };
      if ((product.variants || []).length > 0) {
        payload.variants = draft.variants.map((variant) => ({
          name: variant.name,
          price: Number(variant.price),
          b2bPrice: variant.b2bPrice === "" || variant.b2bPrice == null ? null : Number(variant.b2bPrice),
        }));
      }
      const { data } = await api.put(`/products/${product._id}`, payload);
      setProducts((current) => current.map((entry) => (entry._id === product._id ? { ...entry, ...data.product } : entry)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[product._id];
        return next;
      });
      toast.success(`${product.name} saved`, { id: "b2b-save" });
    } catch (error) {
      toast.error(errMsg(error), { id: "b2b-save" });
    } finally {
      setSavingId("");
    }
  };

  // The catalogue starts empty, so the useful first action is "price everything
  // at once" rather than ten identical edits. Only products without a
  // wholesale price are touched.
  const fillUnpriced = async () => {
    const pct = Number(fillPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      return toast.error("Enter a discount between 1 and 99%");
    }
    const targets = products.filter((product) => !hasWholesale(product));
    if (targets.length === 0) return toast.error("Every product already has a wholesale price");

    setFilling(true);
    const loading = toast.loading(`Pricing ${targets.length} product(s)…`);
    let done = 0;
    try {
      for (const product of targets) {
        const retail = retailOf(product);
        const variants = (product.variants || []).map((variant) => ({
          name: variant.name,
          price: Number(variant.price),
          b2bPrice: round2(Number(variant.price) * (1 - pct / 100)),
        }));
        await api.put(`/products/${product._id}`, {
          b2bPrice: round2(retail * (1 - pct / 100)),
          ...(variants.length > 0 ? { variants } : {}),
        });
        done += 1;
      }
      const { data } = await api.get("/products/admin");
      setProducts(data.products);
      setDrafts({});
      toast.success(`Priced ${done} product(s) at ${pct}% below retail`, { id: loading });
    } catch (error) {
      toast.error(`${done} of ${targets.length} saved — ${errMsg(error)}`, { id: loading });
    } finally {
      setFilling(false);
    }
  };

  const filterButton = (key, label, count) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
        filter === key ? "border-wine-600 bg-wine-50 text-wine-800 font-medium" : "border-wine-100 bg-white text-cocoa-500 hover:border-wine-300"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs text-cocoa-400">{count}</span>
    </button>
  );

  return (
    <div>
      <PageHeader
        title="B2B catalogue"
        subtitle="Wholesale prices for bulk and trade buyers — never shown on the website"
        actions={
          <Link
            to="/admin/products"
            className="inline-flex items-center gap-1.5 border border-wine-100 bg-white hover:border-wine-300 text-cocoa-700 font-medium text-sm px-4 py-2 rounded-xl transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> All products
          </Link>
        }
      />

      <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
        <p className="flex items-start gap-2">
          <Handshake className="w-4 h-4 mt-0.5 shrink-0 text-indigo-600" />
          <span>
            A product joins the B2B catalogue as soon as it has a wholesale price — either on the product
            itself or on any of its sizes. Leave the price blank to keep it retail-only.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard label="In catalogue" value={stats.priced} sub={`of ${stats.total} products`} tone={stats.priced > 0 ? "good" : "warn"} />
        <StatCard label="Retail only" value={stats.total - stats.priced} sub="no wholesale price" />
        <StatCard label="Average discount" value={`${stats.averageDiscount.toFixed(0)}%`} sub="off retail" />
        <StatCard label="Lowest wholesale" value={stats.lowest == null ? "—" : inr(stats.lowest)} sub="across the catalogue" />
      </div>

      {editable && stats.priced < stats.total && (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-wine-100 bg-white p-4">
          <div>
            <span className="block text-xs font-medium text-cocoa-600">Set wholesale for the unpriced products</span>
            <span className="block text-[11px] text-cocoa-400">Percent below retail — applied to the product and every size</span>
          </div>
          <div className="flex items-end gap-2">
            <input
              type="number"
              min="1"
              max="99"
              value={fillPct}
              onChange={(event) => setFillPct(event.target.value)}
              className={`${inputCls} w-24`}
              aria-label="Discount percent"
            />
            <Button onClick={fillUnpriced} disabled={filling} className="whitespace-nowrap">
              <Sparkles className="w-4 h-4" /> {filling ? "Pricing…" : `Fill ${stats.total - stats.priced} unpriced`}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[14rem] max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cocoa-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products…"
            className={`${inputCls} pl-10`}
          />
        </div>
        {filterButton("all", "All", stats.total)}
        {filterButton("priced", "In catalogue", stats.priced)}
        {filterButton("missing", "Retail only", stats.total - stats.priced)}
      </div>

      {!products ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-wine-100">
          <EmptyState icon="🤝" title="Nothing matches" hint="Try a different search, or clear the filter." />
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Retail</Th>
              <Th>Wholesale</Th>
              <Th>Discount</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => {
              const draft = draftFor(product);
              const variants = draft.variants || [];
              const open = expanded[product._id];
              const retail = retailOf(product);
              const wholesale = wholesaleFrom(product, draft);
              const discount = retail > 0 && wholesale != null ? ((retail - wholesale) / retail) * 100 : null;
              const dirty = isDirty(product, draft);

              return (
                <Fragment key={product._id}>
                  <tr className="hover:bg-wine-50/40">
                    <Td label="Product">
                      <div className="flex items-start gap-1.5">
                        {variants.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpanded((current) => ({ ...current, [product._id]: !open }))}
                            className="mt-0.5 text-cocoa-400 hover:text-wine-700"
                            aria-label={open ? "Hide sizes" : "Show sizes"}
                          >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        <div className="min-w-0">
                          <Link to={`/admin/products/${product._id}`} className="font-medium text-cocoa-800 hover:text-wine-700 hover:underline">
                            {product.name}
                          </Link>
                          <div className="text-xs text-cocoa-400">
                            {product.category?.name || "—"}
                            {variants.length > 0 && ` · ${variants.length} sizes`}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap" label="Retail">{inr(retail)}</Td>
                    <Td label="Wholesale">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.b2bPrice}
                        disabled={!editable}
                        onChange={(event) => setDraft(product, { b2bPrice: event.target.value })}
                        placeholder="—"
                        aria-label={`Wholesale price for ${product.name}`}
                        className={`${inputCls} w-28 py-1.5`}
                      />
                    </Td>
                    <Td className="whitespace-nowrap" label="Discount">
                      {discount == null ? (
                        <span className="text-xs text-cocoa-400">—</span>
                      ) : (
                        <span className={discount >= 0 ? "text-emerald-700 font-medium" : "text-rose-600 font-medium"}>
                          {discount >= 0 ? `${discount.toFixed(0)}% off` : `${Math.abs(discount).toFixed(0)}% above`}
                        </span>
                      )}
                    </Td>
                    <Td label="Status">
                      {hasWholesale(product) ? (
                        <Badge className="bg-indigo-50 text-indigo-700">B2B</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500">retail only</Badge>
                      )}
                    </Td>
                    <Td label="Actions">
                      {editable && (
                        <Button
                          variant={dirty ? "primary" : "outline"}
                          className="!px-3 !py-1.5"
                          disabled={!dirty || savingId === product._id}
                          onClick={() => save(product)}
                        >
                          <Save className="w-3.5 h-3.5" /> {savingId === product._id ? "Saving…" : "Save"}
                        </Button>
                      )}
                    </Td>
                  </tr>

                  {open &&
                    variants.map((variant, index) => {
                      const variantDiscount =
                        Number(variant.price) > 0 && variant.b2bPrice !== "" && variant.b2bPrice != null
                          ? ((Number(variant.price) - Number(variant.b2bPrice)) / Number(variant.price)) * 100
                          : null;
                      return (
                        <tr key={`${product._id}-${variant.name}`} className="bg-cream-50/60">
                          <Td label="Size">
                            <span className="pl-6 text-sm text-cocoa-600">{variant.name}</span>
                          </Td>
                          <Td className="whitespace-nowrap text-sm text-cocoa-500" label="Retail">{inr(variant.price)}</Td>
                          <Td label="Wholesale">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.b2bPrice}
                              disabled={!editable}
                              onChange={(event) => setVariantDraft(product, index, event.target.value)}
                              placeholder="—"
                              aria-label={`Wholesale price for ${product.name} ${variant.name}`}
                              className={`${inputCls} w-28 py-1.5`}
                            />
                          </Td>
                          <Td className="whitespace-nowrap text-sm" label="Discount">
                            {variantDiscount == null ? (
                              <span className="text-xs text-cocoa-400">—</span>
                            ) : (
                              <span className={variantDiscount >= 0 ? "text-emerald-700" : "text-rose-600"}>
                                {variantDiscount.toFixed(0)}% off
                              </span>
                            )}
                          </Td>
                          <Td colSpan={2} label="" />
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
