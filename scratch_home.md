import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowDown, Star, Egg, Heart, Sparkles, Clock3, Check, Store, Bike } from "lucide-react";
import api from "../lib/api";
import ProductCard from "../components/public/ProductCard";
import { useSettings } from "../store/SettingsContext";
import {
  SmoothScroll,
  Preloader,
  SplitHeading,
  Reveal,
  Parallax,
  MagneticButton,
  Counter,
  Marquee,
  RotatingBadge,
} from "../lib/motion";

const HERO_FALLBACKS = [
  "/images/products/chocolate.png",
  "/images/products/redvelvet.png",
  "/images/products/lotus.png",
];

const PILLARS = [
  { icon: Egg, num: "01", title: "100% Veg & Eggless", text: "Our entire menu is pure vegetarian — no exceptions, no egg-based shortcuts, ever." },
  { icon: Heart, num: "02", title: "Baked Fresh, Never Frozen", text: "Every cake leaves the oven only after you order it. Small batches, real ingredients." },
  { icon: Sparkles, num: "03", title: "Designed With You", text: "From birthday themes to multi-tier weddings — bespoke cakes sketched around your story." },
  { icon: Clock3, num: "04", title: "Pickup or Delivery", text: "Choose a slot that suits you at checkout, or get it delivered to the celebration." },
];

const TESTIMONIALS = [
  { name: "Priya S.", tag: "Birthday Cake", text: "The Belgian truffle cake was the star of my daughter's birthday. Moist, rich, and not overly sweet. Gone in minutes!" },
  { name: "Rahul M.", tag: "Corporate Order", text: "Ordered brownie boxes for the office — everyone asked where they were from. The packaging alone deserves an award." },
  { name: "Ananya I.", tag: "Custom Cake", text: "They recreated our reference photo exactly, down to the gold leaf. Communication was flawless from enquiry to delivery." },
];

const GALLERY_COLS = [
  ["/images/gallery/gallery1.jpg", "/images/gallery/gallery4.jpg", "/images/gallery/gallery7.jpg"],
  ["/images/gallery/gallery2.jpg", "/images/gallery/gallery5.jpg", "/images/gallery/gallery8.jpg"],
  ["/images/gallery/gallery3.jpg", "/images/gallery/gallery6.jpg"],
];

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const settings = useSettings();
  const navigate = useNavigate();
  const store = settings?.store || {};

  const chooseFulfilment = (type) => {
    try {
      localStorage.setItem("cs_fulfilment_pref", type);
    } catch {
      /* storage unavailable */
    }
    navigate("/menu");
  };

  useEffect(() => {
    document.title = "Cakestyles — Handcrafted Cakes & Bakes";
    api
      .get("/products?featured=1")
      .then((r) => setFeatured(r.data.products.slice(0, 4)))
      .catch(() => {});
  }, []);

  const heroImages = (featured.length ? featured.slice(0, 3).map((p) => p.images?.[0]).filter(Boolean) : HERO_FALLBACKS);

  return (
    <div className="overflow-x-clip">
      <Preloader />
      <SmoothScroll />

      {/* ============================== HERO ============================== */}
      <section data-hero className="relative min-h-[92vh] flex items-center grain bg-gradient-to-b from-blush-100 via-cream-50 to-cream-50">
        {/* soft radial glows */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-[34rem] h-[34rem] rounded-full bg-blush-200/50 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -left-32 w-96 h-96 rounded-full bg-gold-300/20 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-12 gap-12 items-center w-full">
          {/* Copy */}
          <div className="lg:col-span-7">
            <Reveal y={16}>
              <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur border border-wine-200/70 rounded-full pl-1.5 pr-4 py-1.5 text-xs font-medium text-wine-700">
                <span className="bg-wine-700 text-cream-50 rounded-full px-2.5 py-1 text-[10px] tracking-wider uppercase">Studio Bakery</span>
                100% veg & eggless · made to order
              </div>
            </Reveal>

            <SplitHeading
              as="h1"
              text="Every celebration deserves a *showstopper.*"
              delay={0.9}
              className="font-display text-[clamp(2.6rem,7vw,5.4rem)] leading-[1.02] font-semibold text-wine-800 mt-6 text-balance"
            />

            <Reveal delay={1.6} y={20}>
              <p className="text-cocoa-500 text-base sm:text-lg max-w-md leading-relaxed mt-6">
                {store.tagline || "Handcrafted cakes, brownies and desserts from our studio kitchen — baked fresh for your celebrations, big and small."}
              </p>
            </Reveal>

            <Reveal delay={1.75} y={20}>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <MagneticButton
                  onClick={() => (window.location.href = "/menu")}
                  className="group inline-flex items-center gap-2.5 bg-wine-700 hover:bg-wine-800 text-cream-50 font-medium px-8 py-4 rounded-full text-sm tracking-wide shadow-xl shadow-wine-700/20 transition-colors"
                >
                  Order Online
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </MagneticButton>
                <Link
                  to="/custom-cakes"
                  className="inline-flex items-center gap-2 border border-wine-300/80 hover:border-wine-500 hover:bg-white/60 text-wine-700 font-medium px-8 py-4 rounded-full text-sm tracking-wide transition-all"
                >
                  Design a Custom Cake
                </Link>
              </div>
            </Reveal>

            <Reveal delay={1.9} y={16}>
              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-xs text-cocoa-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex text-gold-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </span>
                  4.9 loved by customers
                </span>
                <span className="hidden sm:inline w-px h-4 bg-wine-200" />
                <span><Counter to={2500} suffix="+" /> cakes & counting</span>
                <span className="hidden sm:inline w-px h-4 bg-wine-200" />
                <span>Fresh every single day</span>
              </div>
            </Reveal>
          </div>

          {/* Floating product cluster */}
          <div className="lg:col-span-5 relative h-[26rem] sm:h-[30rem] hidden md:block">
            <Parallax speed={0.12} className="absolute top-2 right-8 w-52 sm:w-60">
              <div className="animate-float rounded-[2rem] overflow-hidden border border-white shadow-2xl shadow-wine-900/20 rotate-3">
                <img src={heroImages[0]} alt="Signature cake" className="w-full aspect-square object-cover" />
              </div>
            </Parallax>
            <Parallax speed={-0.1} className="absolute bottom-6 left-4 w-44 sm:w-52">
              <div className="animate-float rounded-[2rem] overflow-hidden border border-white shadow-2xl shadow-wine-900/20 -rotate-6" style={{ animationDelay: "1.4s" }}>
                <img src={heroImages[1]} alt="Freshly baked treat" className="w-full aspect-square object-cover" />
              </div>
            </Parallax>
            <Parallax speed={0.06} className="absolute bottom-24 right-2 w-36 sm:w-44">
              <div className="animate-float rounded-[1.6rem] overflow-hidden border border-white shadow-xl shadow-wine-900/20 rotate-6" style={{ animationDelay: "0.7s" }}>
                <img src={heroImages[2]} alt="Dessert of the day" className="w-full aspect-square object-cover" />
              </div>
            </Parallax>
            <div className="absolute top-6 left-0">
              <RotatingBadge className="drop-shadow-xl" />
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-wine-400">
          <span className="text-[10px] tracking-[0.3em] uppercase">Scroll</span>
          <ArrowDown className="w-4 h-4 animate-bounce" />
        </div>
      </section>

      {/* ============================ MARQUEE ============================ */}
      <Marquee
        className="bg-wine-900 text-cream-100 py-4 text-sm font-medium tracking-[0.18em] uppercase"
        items={["Handcrafted daily", "100% eggless", "Real Belgian chocolate", "Custom wedding cakes", "Fresh cream, never artificial", "Made to order"]}
      />

      {/* ===================== PICK-UP / DELIVERY ===================== */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
        <Reveal>
          <p className="text-xs tracking-[0.3em] uppercase text-gold-600 font-semibold">Start your order</p>
        </Reveal>
        <SplitHeading
          text="How would you like your *treats?*"
          className="font-display text-3xl sm:text-5xl font-semibold text-wine-800 mt-3 text-balance"
        />
        <Reveal delay={0.15}>
          <p className="text-sm text-cocoa-500 mt-4">100% veg · Baked fresh to order — pick a way to get them.</p>
        </Reveal>

        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          {[
            { id: "pickup", icon: Store, title: "Self Pick-up", sub: "Or arrange your own delivery", hint: "Choose a pickup slot at checkout" },
            { id: "delivery", icon: Bike, title: "Get It Delivered", sub: "Delivered to your doorstep", hint: "Enter your address at checkout" },
          ].map(({ id, icon: Icon, title, sub, hint }, i) => (
            <Reveal key={id} delay={0.2 + i * 0.12}>
              <button
                onClick={() => chooseFulfilment(id)}
                className="group relative w-full bg-white rounded-3xl border border-wine-100 hover:border-wine-400 p-7 text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-wine-900/10"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-wine-600 to-wine-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-gold-300" />
                </div>
                <h2 className="font-display text-xl font-semibold text-wine-800 mt-5 uppercase tracking-wide">{title}</h2>
                <p className="text-sm text-cocoa-500 mt-1.5">{sub}</p>
                <p className="text-xs text-cocoa-400 mt-1">{hint}</p>
                <ArrowRight className="w-4 h-4 text-wine-400 absolute top-7 right-7 transition-all group-hover:translate-x-1 group-hover:text-wine-700" />
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============================ PILLARS ============================ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <p className="text-xs tracking-[0.3em] uppercase text-gold-600 font-semibold">Why Cakestyles</p>
        </Reveal>
        <SplitHeading
          text="Baked the *slow,* honest way."
          className="font-display text-3xl sm:text-5xl font-semibold text-wine-800 mt-3 text-balance"
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          {PILLARS.map(({ icon: Icon, num, title, text }, i) => (
            <Reveal key={title} delay={i * 0.12}>
              <div className="group relative bg-white rounded-3xl border border-wine-100 p-6 h-full transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-wine-900/10 hover:border-wine-200">
                <span className="absolute top-5 right-6 font-display text-4xl text-wine-100 group-hover:text-blush-200 transition-colors">{num}</span>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-wine-600 to-wine-800 flex items-center justify-center shadow-lg shadow-wine-700/25">
                  <Icon className="w-5 h-5 text-gold-300" />
                </div>
                <h3 className="font-medium text-cocoa-900 mt-5">{title}</h3>
                <p className="text-sm text-cocoa-500 mt-2 leading-relaxed">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ========================== BESTSELLERS ========================== */}
      {featured.length > 0 && (
        <section className="bg-gradient-to-b from-cream-50 via-blush-50/60 to-cream-50 py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Reveal>
                  <p className="text-xs tracking-[0.3em] uppercase text-gold-600 font-semibold">Crowd favourites</p>
                </Reveal>
                <SplitHeading
                  text="The bakes they *keep* coming back for."
                  className="font-display text-3xl sm:text-5xl font-semibold text-wine-800 mt-3 text-balance"
                />
              </div>
              <Reveal delay={0.2}>
                <Link to="/menu" className="group inline-flex items-center gap-2 text-sm font-medium text-wine-700 hover:text-wine-900">
                  View the full menu
                  <span className="w-9 h-9 rounded-full border border-wine-200 flex items-center justify-center transition-all group-hover:bg-wine-700 group-hover:border-wine-700 group-hover:text-cream-50">
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </Reveal>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-12">
              {featured.map((p, i) => (
                <Reveal key={p._id} delay={i * 0.1}>
                  <ProductCard product={p} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =========================== STATS STRIP =========================== */}
      <section className="relative bg-wine-900 grain overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/3 w-96 h-96 rounded-full bg-wine-700/60 blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid grid-cols-2 lg:grid-cols-4 gap-10 text-center relative">
          {[
            { value: <Counter to={2500} suffix="+" />, label: "Cakes & bakes delivered" },
            { value: <Counter to={6} suffix=" yrs" />, label: "Of celebrations" },
            { value: <Counter to={100} suffix="%" />, label: "Veg & eggless menu" },
            { value: <>4.9<span className="text-gold-400">★</span></>, label: "Average rating" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className="font-display text-4xl sm:text-5xl font-semibold text-cream-50">{s.value}</div>
              <div className="text-xs tracking-[0.2em] uppercase text-blush-200/60 mt-3">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ========================= CUSTOM CAKES ========================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-14 items-center">
        {/* Image cluster */}
        <div className="relative h-[24rem] sm:h-[28rem] order-2 lg:order-1">
          <Parallax speed={0.14} className="absolute inset-x-8 top-0 bottom-16">
            <div className="h-full rounded-[2.5rem] overflow-hidden border-8 border-white shadow-2xl shadow-wine-900/20 rotate-2">
              <img src="/images/gallery/gallery2.jpg" alt="Custom celebration cake" className="w-full h-full object-cover" />
            </div>
          </Parallax>
          <Parallax speed={-0.12} className="absolute -bottom-2 -left-2 w-40 sm:w-52">
            <div className="rounded-[1.8rem] overflow-hidden border-[6px] border-white shadow-xl shadow-wine-900/25 -rotate-3">
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.

