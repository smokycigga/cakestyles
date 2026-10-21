import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  ArrowRight, 
  Star, 
  Phone, 
  Mail, 
  MapPin, 
  Check, 
  Heart, 
  ShieldCheck 
} from "lucide-react";
import { Instagram, Facebook, WhatsApp } from "../components/public/icons";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import api from "../lib/api";
import CakeStylesLogo from "../components/public/CakeStylesLogo";
import ExpandableGallery from "../components/ui/expandable-gallery";
import CircularImageGallery from "../components/ui/carousel-circular-image-gallery";
import { useCart } from "../store/CartContext";
import { getProductImage } from "../lib/productImage";
import { toBestsellerCard } from "../lib/catalog";
import { Placeholder } from "../components/public/ProductCard";
import {
  SmoothScroll,
  MagneticButton,
} from "../lib/motion";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const HERO_VIDEO = "/images/gallery/Create_a_premium_cinematic_bak%20(1).mp4";

// Customer reviews data
const REVIEWS = [
  {
    id: 1,
    quote: "The freshness and flavor are unmatched. Every single bite feels like absolute happiness.",
    author: "Ananya S.",
    city: "Kolkata",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    rating: 5,
  },
  {
    id: 2,
    quote: "Cakestyles never fails to make our celebrations extra special! The custom birthday cake was a huge hit.",
    author: "Rohit P.",
    city: "Bangalore",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    rating: 5,
  },
  {
    id: 3,
    quote: "Beautiful cakes, amazing taste, and such elegant packaging. Best eggless bakery in the country.",
    author: "Meera K.",
    city: "Mumbai",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
    rating: 5,
  },
  {
    id: 4,
    quote: "Ordered the Biscoff cheesecake and brownies. The texture was heavenly and melted instantly in my mouth.",
    author: "Siddharth V.",
    city: "Delhi",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    rating: 5,
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  
  const portalRef = useRef(null);
  const carouselRef = useRef(null);
  const reviewsCarouselRef = useRef(null);
  const [bestsellers, setBestsellers] = useState([]);
  const [bestsellersLoading, setBestsellersLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  // The bestsellers row is real data: ranked by units sold, falling back to
  // Featured products before any sales exist. Nothing is hardcoded, so a new
  // product can appear here without a code change.
  useEffect(() => {
    document.title = "Cakestyles — Luxury Parisian Patisserie";
    let active = true;

    api
      .get("/products?bestsellers=1&limit=8")
      .then((response) => {
        if (!active) return;
        const source = response.data?.source === "featured" ? "featured" : "sales";
        setBestsellers(
          (response.data?.products || []).map((product) =>
            toBestsellerCard(product, getProductImage(product), source),
          ),
        );
      })
      .catch(() => {
        if (active) setBestsellers([]);
      })
      .finally(() => {
        if (active) setBestsellersLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Buttery-smooth GSAP ScrollTrigger synchronized with Lenis
  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: portalRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });

      tl.to(".portal-left-panel", { xPercent: -102, ease: "power1.inOut" }, 0)
        .to(".portal-right-panel", { xPercent: 102, ease: "power1.inOut" }, 0)
        .to(".portal-logo", { scale: 1.18, opacity: 0.95, ease: "power1.inOut" }, 0)
        .to(".portal-video-bg", { scale: 1.0, ease: "power1.inOut" }, 0)
        .to(".portal-duotone", { opacity: 0.35, ease: "power1.inOut" }, 0)
        .to(".portal-dot-tl", { top: "8%", left: "6%", opacity: 0.4, ease: "power1.inOut" }, 0)
        .to(".portal-dot-br", { bottom: "8%", right: "6%", opacity: 0.4, ease: "power1.inOut" }, 0)
        .to(".portal-seal", { opacity: 0.2, ease: "power1.inOut" }, 0);

      // Trigger recalculation after DOM is fully painted
      ScrollTrigger.refresh();
    },
    { scope: portalRef }
  );

  const scrollCarousel = (direction) => {
    if (!carouselRef.current) return;
    const scrollAmount = direction * 340;
    carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  const scrollReviews = (direction) => {
    if (!reviewsCarouselRef.current) return;
    const scrollAmount = direction * 360;
    reviewsCarouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  const handleQuickAdd = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    // A product with sizes has no single price to add. Send the customer to
    // the detail page to pick one instead of guessing and getting it wrong.
    if (item.variants?.length > 0) {
      navigate(item.slug ? `/menu/product/${item.slug}` : "/menu");
      return;
    }

    addToCart({
      productId: item.id,
      slug: item.slug,
      name: item.name,
      image: item.image,
      unitPrice: item.price,
      quantity: 1,
    });
  };

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (!emailInput) return;
    setSubscribed(true);
  };

  return (
    <div className="overflow-x-clip bg-[#fff9fa] text-[#461220] selection:bg-[#eed3db] selection:text-[#461220]">
      <SmoothScroll />

      {/* =================================================================== */}
      {/* 1. PORTAL HERO                                                      */}
      {/* =================================================================== */}
      <section ref={portalRef} className="relative h-[220vh] w-full bg-[#eed3db]">
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden isolate flex items-center justify-center">
          
          {/* Layer 1: Full-Bleed Looping Background Video */}
          <div className="portal-video-bg absolute inset-0 z-0 origin-center scale-110 will-change-transform">
            <video 
              src={HERO_VIDEO} 
              poster="/images/gallery/gallery3.jpg"
              preload="metadata"
              autoPlay loop muted playsInline 
              className="w-full h-full object-cover"
            />
            <div className="portal-duotone absolute inset-0 bg-[#eed3db] mix-blend-color opacity-0 pointer-events-none will-change-opacity" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(70,18,32,0.18)_100%)] pointer-events-none" />
          </div>

          {/* Layer 2: Parting Portal Panels */}
          <div className="portal-left-panel absolute top-0 bottom-0 left-0 w-[52vw] bg-[#fbf2f4] z-10 border-r border-[#461220]/10 shadow-[20px_0_40px_rgba(70,18,32,0.08)] pointer-events-none will-change-transform" />
          <div className="portal-right-panel absolute top-0 bottom-0 right-0 w-[52vw] bg-[#fbf2f4] z-10 border-l border-[#461220]/10 shadow-[-20px_0_40px_rgba(70,18,32,0.08)] pointer-events-none will-change-transform" />

          {/* Layer 3: Travelling Accent Dots */}
          <div className="portal-dot-tl absolute z-20 w-2 h-2 rounded-full bg-[#c88242] shadow-[0_0_12px_#c88242] pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 will-change-transform" />
          <div className="portal-dot-br absolute z-20 w-2 h-2 rounded-full bg-[#c88242] shadow-[0_0_12px_#c88242] pointer-events-none bottom-1/2 right-1/2 translate-x-1/2 translate-y-1/2 will-change-transform" />

          {/* Layer 4: Exact Vector Logo in Portal */}
          <div className="portal-logo relative z-20 flex items-center justify-center w-full max-w-xl sm:max-w-2xl select-none pointer-events-none px-6 will-change-transform">
            <div className="w-full flex items-center justify-center">
              <CakeStylesLogo 
                className="w-full h-auto max-h-[18vh] drop-shadow-md text-[#9D182B]"
              />
            </div>
          </div>

          {/* Layer 5: Corner Metadata */}
          <div className="absolute top-20 left-6 sm:left-10 z-20 pointer-events-none hidden sm:block">
            <p className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#461220]/75">
              KOLKATA
            </p>
          </div>
          <div className="absolute top-20 right-6 sm:right-10 z-20 pointer-events-none hidden sm:block">
            <p className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[#461220]/75">
              ESTD 2016
            </p>
          </div>

          {/* Lower Left: Luxury Packaging Seal */}
          <div className="portal-seal absolute bottom-6 sm:bottom-10 left-5 sm:left-10 z-20 pointer-events-none will-change-opacity">
            <div className="w-[64px] h-[64px] sm:w-[72px] sm:h-[72px] rounded-full border border-[#461220]/30 bg-white/40 backdrop-blur-[6px] flex flex-col items-center justify-center text-[#461220] text-center shadow-[0_4px_16px_rgba(70,18,32,0.08)] p-1">
              <div className="w-full h-full rounded-full border border-dashed border-[#461220]/25 flex flex-col items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                  <path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z" />
                </svg>
                <span className="text-[6px] sm:text-[7px] font-bold leading-[1.05] uppercase tracking-[0.14em] mt-0.5 opacity-90">
                  Made Fresh<br />Every Day
                </span>
              </div>
            </div>
          </div>

          {/* Lower Right: Scroll Indicator */}
          <div className="absolute bottom-7 sm:bottom-10 right-6 sm:right-10 z-20 pointer-events-none flex items-center gap-2 text-[#461220]/80">
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">SCROLL TO EXPLORE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#c88242] animate-pulse" />
          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. OUR BESTSELLERS SECTION                                          */}
      {/* =================================================================== */}
      <section className="relative bg-[#fff9fa] py-16 sm:py-24 px-4 sm:px-10 lg:px-16 overflow-hidden border-b border-[#461220]/10">
        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="w-2 h-2 rounded-full bg-[#c88242]" />
                <p className="text-[11px] uppercase tracking-[0.25em] font-semibold text-[#461220]/80">
                  01 / CURATED RELEASES
                </p>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#461220] tracking-tight">
                Our Bestsellers
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-[#70293b] max-w-lg leading-relaxed">
                Handcrafted daily with authentic Parisian recipes, Belgian couverture & fresh dairy cream.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Link
                to="/menu"
                className="group flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#461220] hover:text-[#c88242] transition-colors"
              >
                <span>View All Menu</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#c88242]" />
              </Link>
            </div>
          </div>

          {/* Carousel Slider with Left / Right Floating Buttons */}
          <div className="relative group/carousel">
            
            {/* Left Nav Arrow Button */}
            <button
              onClick={() => scrollCarousel(-1)}
              className="absolute -left-2 sm:-left-6 top-[42%] -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#fae5eb] border border-[#eed3db] text-[#461220] flex items-center justify-center shadow-md hover:bg-[#f7d4df] hover:scale-105 active:scale-95 transition-all"
              aria-label="Previous bestsellers"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Right Nav Arrow Button */}
            <button
              onClick={() => scrollCarousel(1)}
              className="absolute -right-2 sm:-right-6 top-[42%] -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#fae5eb] border border-[#eed3db] text-[#461220] flex items-center justify-center shadow-md hover:bg-[#f7d4df] hover:scale-105 active:scale-95 transition-all"
              aria-label="Next bestsellers"
            >
              <ChevronRight className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Scrollable Products Row */}
            <div
              ref={carouselRef}
              className="flex gap-4 sm:gap-7 overflow-x-auto scrollbar-none scroll-smooth pb-6 px-1"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {bestsellersLoading &&
                [...Array(3)].map((_, index) => (
                  <div
                    key={index}
                    className="w-[260px] sm:w-[300px] lg:w-[320px] shrink-0 rounded-3xl border border-[#461220]/8 bg-white p-4 sm:p-5"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <div className="aspect-square animate-pulse rounded-2xl bg-[#f4dfe6]" />
                    <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-[#f4dfe6]" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-[#f9edf2]" />
                  </div>
                ))}

              {!bestsellersLoading && bestsellers.length === 0 && (
                <div className="w-full py-12 text-center">
                  <p className="text-sm text-[#70293b]">
                    Our bakers are preparing something special — check back soon.
                  </p>
                </div>
              )}

              {!bestsellersLoading && bestsellers.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate(item.slug ? `/menu/product/${item.slug}` : "/menu")}
                  className="w-[260px] sm:w-[300px] lg:w-[320px] shrink-0 bg-white rounded-3xl p-4 sm:p-5 border border-[#461220]/12 shadow-[0_8px_24px_rgba(70,18,32,0.05)] hover:shadow-[0_16px_36px_rgba(70,18,32,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between group"
                  style={{ scrollSnapAlign: "start" }}
                >
                  {/* Card Header Tag */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#70293b]">
                      {item.category}
                    </span>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#eed3db] text-[#461220]">
                      {item.tag}
                    </span>
                  </div>

                  {/* Product Photography Box with Soft Studio BG */}
                  <div className="relative aspect-square rounded-2xl bg-gradient-to-b from-[#fdf0f4] to-[#fae6ec] overflow-hidden flex items-center justify-center p-4 border border-[#461220]/05">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain drop-shadow-lg group-hover:scale-106 transition-transform duration-500"
                      />
                    ) : (
                      <Placeholder name={item.name} className="w-full h-full rounded-2xl" />
                    )}

                    {/* Circular Wine Add Button */}
                    <button
                      onClick={(e) => handleQuickAdd(e, item)}
                      className="absolute bottom-3 right-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#461220] hover:bg-[#340d18] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(70,18,32,0.3)] active:scale-90 transition-transform"
                      aria-label={`Add ${item.name} to cart`}
                    >
                      <Plus className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Card Details */}
                  <div className="pt-4 px-1">
                    <h3 className="font-display text-lg sm:text-xl font-semibold text-[#461220] leading-snug group-hover:text-[#c88242] transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs text-[#70293b] mt-1.5 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                    
                    <div className="mt-4 pt-3 border-t border-[#461220]/10 flex items-center justify-between">
                      <span className="font-display text-lg sm:text-xl font-bold text-[#461220]">
                        ₹{item.price}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-[#c88242] group-hover:underline flex items-center gap-1">
                        Order Now →
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. CUSTOM CREATIONS BANNER + 3 BENEFIT BADGES                       */}
      {/* =================================================================== */}
      <section className="relative bg-[#fff9fa] py-16 sm:py-24 px-4 sm:px-10 lg:px-16 overflow-hidden border-b border-[#461220]/10">
        
        <div className="max-w-5xl mx-auto relative z-10 space-y-10 sm:space-y-14">
          
          {/* Main Custom Creations Banner Card */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[#fae7ed] via-[#fae6ec] to-[#f8dce5] border border-[#eed3db] overflow-hidden shadow-[0_16px_40px_rgba(70,18,32,0.08)]">
            
            <div className="grid md:grid-cols-12 gap-8 items-center p-6 sm:p-10 lg:p-12">
              
              {/* Left Column: Pill, Title, Text, Button */}
              <div className="md:col-span-7 space-y-5">
                
                {/* Pill Badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#461220]/20 bg-white/50 text-xs font-bold uppercase tracking-widest text-[#461220]">
                  <span>🎁</span>
                  <span>Custom Creations</span>
                </div>

                {/* Big Editorial Headline */}
                <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-[#461220] leading-[1.15] tracking-tight">
                  Dream it.<br />
                  <span className="italic font-normal text-[#c88242]">We bake it.</span>
                </h2>

                {/* Subtitle */}
                <p className="text-xs sm:text-sm text-[#70293b] leading-relaxed max-w-md">
                  From intimate birthdays to lavish multi-tier celebrations, we create cakes as special as your moments.
                </p>

                {/* CTA Button */}
                <div className="pt-2">
                  <MagneticButton
                    onClick={() => navigate("/custom-cakes")}
                    className="inline-flex items-center gap-2.5 bg-[#461220] hover:bg-[#340d18] text-white px-7 py-3.5 rounded-full text-xs sm:text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                  >
                    <span>Order Custom Cake</span>
                    <ArrowRight className="w-4 h-4" />
                  </MagneticButton>
                </div>

              </div>

              {/* Right Column: Custom Cake Photography */}
              <div className="md:col-span-5 flex justify-center">
                <CircularImageGallery />
              </div>

            </div>

          </div>

          {/* 3 Benefit Badges (Fast Delivery, 100% Eggless, Secure Packaging) */}
          <div className="grid sm:grid-cols-3 gap-5">
            
            {/* 1. Fast Delivery */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#eed3db]/80 shadow-[0_4px_16px_rgba(70,18,32,0.04)]">
              <div className="w-13 h-13 rounded-full bg-[#fde9ee] text-[#461220] flex items-center justify-center shrink-0 p-3.5 shadow-inner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="18" r="3" />
                  <path d="M6 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l3 4h4" />
                  <path d="M15 13l2-4h3" />
                  <path d="M9 18l3-5h6" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-base font-bold text-[#461220]">Fast Delivery</h4>
                <p className="text-xs text-[#70293b] mt-0.5">On time, every time</p>
              </div>
            </div>

            {/* 2. 100% Eggless */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#eed3db]/80 shadow-[0_4px_16px_rgba(70,18,32,0.04)]">
              <div className="w-13 h-13 rounded-full bg-[#fde9ee] text-[#461220] flex items-center justify-center shrink-0 p-3.5 shadow-inner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
                  <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2-1 2-1" />
                  <path d="M2 21h20" />
                  <path d="M7 8v3" />
                  <path d="M12 8v3" />
                  <path d="M17 8v3" />
                  <path d="M7 4h.01" />
                  <path d="M12 4h.01" />
                  <path d="M17 4h.01" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-base font-bold text-[#461220]">100% Eggless</h4>
                <p className="text-xs text-[#70293b] mt-0.5">Pure & delicious</p>
              </div>
            </div>

            {/* 3. Secure Packaging */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#eed3db]/80 shadow-[0_4px_16px_rgba(70,18,32,0.04)]">
              <div className="w-13 h-13 rounded-full bg-[#fde9ee] text-[#461220] flex items-center justify-center shrink-0 p-3.5 shadow-inner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-base font-bold text-[#461220]">Secure Packaging</h4>
                <p className="text-xs text-[#70293b] mt-0.5">Handled with care</p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. "LOVED BY THOUSANDS" REVIEWS SECTION (Reference Image)          */}
      {/* =================================================================== */}
      <section className="relative bg-[#fff9fa] py-16 sm:py-24 px-4 sm:px-10 lg:px-16 overflow-hidden border-b border-[#461220]/10">
        <div className="max-w-7xl mx-auto relative z-10">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 sm:mb-12 gap-4">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#461220] tracking-tight">
                Loved by Thousands
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-[#70293b] leading-relaxed">
                Real moments, real smiles.
              </p>
            </div>

            <Link
              to="/about"
              className="group flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#461220] hover:text-[#c88242] transition-colors"
            >
              <span>View All Reviews</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#c88242]" />
            </Link>
          </div>

          {/* Carousel Review Cards */}
          <div className="relative group/reviews">
            
            {/* Left Nav Arrow Button */}
            <button
              onClick={() => scrollReviews(-1)}
              className="absolute -left-2 sm:-left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#fae5eb] border border-[#eed3db] text-[#461220] flex items-center justify-center shadow-md hover:bg-[#f7d4df] hover:scale-105 active:scale-95 transition-all"
              aria-label="Previous reviews"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Right Nav Arrow Button */}
            <button
              onClick={() => scrollReviews(1)}
              className="absolute -right-2 sm:-right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#fae5eb] border border-[#eed3db] text-[#461220] flex items-center justify-center shadow-md hover:bg-[#f7d4df] hover:scale-105 active:scale-95 transition-all"
              aria-label="Next reviews"
            >
              <ChevronRight className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Scrollable Reviews Row */}
            <div
              ref={reviewsCarouselRef}
              className="flex gap-4 sm:gap-6 overflow-x-auto scrollbar-none scroll-smooth pb-6 px-1"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {REVIEWS.map((rev) => (
                <div
                  key={rev.id}
                  className="w-[280px] sm:w-[320px] lg:w-[360px] shrink-0 bg-gradient-to-b from-[#fae7ed]/60 to-white rounded-3xl p-6 sm:p-7 border border-[#461220]/10 shadow-[0_8px_24px_rgba(70,18,32,0.04)] flex flex-col justify-between"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <div>
                    {/* Quotation Badge */}
                    <div className="w-9 h-9 rounded-full bg-[#fae6ec] text-[#461220] flex items-center justify-center text-lg font-serif font-bold shadow-inner mb-4">
                      “
                    </div>

                    {/* Review text */}
                    <p className="text-xs sm:text-sm text-[#461220] leading-relaxed font-normal">
                      {rev.quote}
                    </p>

                    {/* 5 Stars */}
                    <div className="flex items-center gap-1 mt-4 text-[#461220]">
                      {[...Array(rev.rating)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-[#461220] stroke-none" />
                      ))}
                    </div>
                  </div>

                  {/* Author Profile */}
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-[#461220]/10">
                    <img
                      src={rev.avatar}
                      alt={rev.author}
                      className="w-10 h-10 rounded-full object-cover border border-[#eed3db]"
                    />
                    <div>
                      <h4 className="font-sans text-xs sm:text-sm font-bold text-[#461220]">
                        {rev.author}
                      </h4>
                      <p className="text-[11px] text-[#70293b]/80">
                        {rev.city}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. "OUR PROMISE" BRAND BANNER (Reference Image)                    */}
      {/* =================================================================== */}
      <section className="relative bg-[#fff9fa] py-12 sm:py-16 px-4 sm:px-10 lg:px-16 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          
          <div className="relative rounded-3xl bg-[#fbe7ed] border border-[#eed3db] p-8 sm:p-12 lg:p-14 shadow-[0_12px_36px_rgba(70,18,32,0.06)] overflow-hidden">
            
            <div className="grid lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column */}
              <div className="lg:col-span-5 space-y-4">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#461220]/20 bg-white/50 text-xs font-semibold text-[#461220]">
                  <Heart className="w-3.5 h-3.5 fill-[#461220]/30 stroke-[#461220]" />
                  <span>Our Promise</span>
                </div>

                <h3 className="font-display text-3xl sm:text-4xl font-semibold text-[#461220] leading-tight">
                  Pure Ingredients.<br />Honest Bakes.
                </h3>

                <p className="text-xs sm:text-sm text-[#70293b] leading-relaxed max-w-sm">
                  We believe in keeping it real with clean ingredients and lots of love.
                </p>
              </div>

              {/* Right Column: 4 Circular Outline Pillars */}
              <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                
                {/* 1. No Preservatives */}
                <div className="flex flex-col items-center p-3">
                  <div className="w-14 h-14 rounded-full border border-[#461220]/25 bg-white/60 flex items-center justify-center text-[#461220] mb-2.5 shadow-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M4.93 4.93l14.14 14.14" />
                    </svg>
                  </div>
                  <h5 className="font-sans text-xs font-bold text-[#461220]">No Preservatives</h5>
                  <p className="text-[10px] text-[#70293b]/80">Ever</p>
                </div>

                {/* 2. No Artificial Flavors */}
                <div className="flex flex-col items-center p-3">
                  <div className="w-14 h-14 rounded-full border border-[#461220]/25 bg-white/60 flex items-center justify-center text-[#461220] mb-2.5 shadow-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
                      <path d="M8.5 2h7" />
                      <path d="M7 16h10" />
                    </svg>
                  </div>
                  <h5 className="font-sans text-xs font-bold text-[#461220]">No Artificial</h5>
                  <p className="text-[10px] text-[#70293b]/80">Flavors</p>
                </div>

                {/* 3. No Refined Sugar */}
                <div className="flex flex-col items-center p-3">
                  <div className="w-14 h-14 rounded-full border border-[#461220]/25 bg-white/60 flex items-center justify-center text-[#461220] mb-2.5 shadow-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18" />
                      <path d="M9 21V9" />
                      <path d="M5 5l14 14" />
                    </svg>
                  </div>
                  <h5 className="font-sans text-xs font-bold text-[#461220]">No Refined</h5>
                  <p className="text-[10px] text-[#70293b]/80">Sugar</p>
                </div>

                {/* 4. Sourced Responsibly */}
                <div className="flex flex-col items-center p-3">
                  <div className="w-14 h-14 rounded-full border border-[#461220]/25 bg-white/60 flex items-center justify-center text-[#461220] mb-2.5 shadow-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#461220" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
                      <path d="M12 6v12" />
                      <path d="M8 10l4-4 4 4" />
                    </svg>
                  </div>
                  <h5 className="font-sans text-xs font-bold text-[#461220]">Sourced</h5>
                  <p className="text-[10px] text-[#70293b]/80">Responsibly</p>
                </div>

              </div>

            </div>

          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 6. "A LITTLE SWEETNESS ON INSTAGRAM" (Reference Image)               */}
      {/* =================================================================== */}
      <ExpandableGallery />

      {/* =================================================================== */}
      {/* 7. "LET'S STAY IN TOUCH" NEWSLETTER BANNER (Reference Image)        */}
      {/* =================================================================== */}
      <section className="relative bg-[#fff9fa] py-14 sm:py-20 px-4 sm:px-10 lg:px-16 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          
          <div className="relative rounded-3xl bg-gradient-to-r from-[#fae7ed] via-[#fae6ec] to-[#f8dce5] border border-[#eed3db] p-8 sm:p-12 text-center shadow-[0_12px_36px_rgba(70,18,32,0.06)] overflow-hidden">
            
            {/* Background floral accents */}
            <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-white/30 blur-xl pointer-events-none" />
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/30 blur-xl pointer-events-none" />

            <div className="relative z-10 max-w-lg mx-auto space-y-4">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#461220]">
                Let’s stay in touch
              </h2>
              
              <p className="text-xs sm:text-sm text-[#70293b] leading-relaxed">
                Be the first to know about new bakes, offers and sweet surprises.
              </p>

              {/* Form */}
              <form onSubmit={handleNewsletterSubmit} className="pt-2 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="flex-1 px-5 py-3 rounded-full bg-white border border-[#eed3db] text-xs sm:text-sm text-[#461220] placeholder:text-[#70293b]/60 outline-none focus:border-[#461220] transition-colors"
                />
                <button
                  type="submit"
                  className="bg-[#461220] hover:bg-[#340d18] text-white px-6 py-3 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <span>{subscribed ? "Subscribed!" : "Subscribe"}</span>
                  {subscribed ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              {/* Spam note */}
              <p className="text-[11px] text-[#70293b]/80 flex items-center justify-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#461220]" />
                <span>No spam. Only sweetness.</span>
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* =================================================================== */}
      {/* 8. UNIFIED FOOTER (Reference Image)                                 */}
      {/* =================================================================== */}
      <footer className="bg-[#fff9fa] border-t border-[#461220]/12 pt-16 pb-12 px-6 sm:px-12 lg:px-20 text-[#461220]">
        <div className="max-w-7xl mx-auto grid gap-10 sm:grid-cols-2 lg:grid-cols-12 pb-12 border-b border-[#461220]/10">
          
          {/* Column 1: Brand Wordmark & Socials */}
          <div className="lg:col-span-4 space-y-4">
            <Link to="/" className="inline-block">
              <CakeStylesLogo className="h-7 sm:h-8 w-auto text-[#9D182B]" />
            </Link>
            <p className="text-xs sm:text-sm text-[#70293b] max-w-xs leading-relaxed">
              Baked with love. Crafted with passion. Delivered to make moments sweeter.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-2.5 pt-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#461220]/25 flex items-center justify-center text-[#461220] hover:bg-[#eed3db]/40 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#461220]/25 flex items-center justify-center text-[#461220] hover:bg-[#eed3db]/40 transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#461220]/25 flex items-center justify-center text-[#461220] hover:bg-[#eed3db]/40 transition-colors"
                aria-label="WhatsApp"
              >
                <WhatsApp className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Shop Links */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-[#461220]">Shop</h4>
            <ul className="space-y-2 text-xs text-[#70293b]">
              <li><Link to="/menu" className="hover:text-[#461220] transition-colors">Cakes</Link></li>
              <li><Link to="/menu" className="hover:text-[#461220] transition-colors">Pastries</Link></li>
              <li><Link to="/custom-cakes" className="hover:text-[#461220] transition-colors">Custom Cakes</Link></li>
              <li><Link to="/menu" className="hover:text-[#461220] transition-colors">Combos & Boxes</Link></li>
            </ul>
          </div>

          {/* Column 3: Help Links */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-[#461220]">Help</h4>
            <ul className="space-y-2 text-xs text-[#70293b]">
              <li><Link to="/contact" className="hover:text-[#461220] transition-colors">FAQs</Link></li>
              <li><Link to="/track" className="hover:text-[#461220] transition-colors">Delivery Info</Link></li>
              <li><Link to="/contact" className="hover:text-[#461220] transition-colors">Returns</Link></li>
              <li><Link to="/contact" className="hover:text-[#461220] transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          {/* Column 4: Company Links */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-[#461220]">Company</h4>
            <ul className="space-y-2 text-xs text-[#70293b]">
              <li><Link to="/about" className="hover:text-[#461220] transition-colors">Our Story</Link></li>
              <li><Link to="/about" className="hover:text-[#461220] transition-colors">Blog</Link></li>
              <li><Link to="/about" className="hover:text-[#461220] transition-colors">Careers</Link></li>
              <li><Link to="/contact" className="hover:text-[#461220] transition-colors">Locations</Link></li>
            </ul>
          </div>

          {/* Column 5: Contact Details */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-[#461220]">Contact</h4>
            <div className="space-y-2 text-xs text-[#70293b]">
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#c88242] shrink-0" />
                <a href="tel:+919876543210" className="hover:text-[#461220] transition-colors">+91 98765 43210</a>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#c88242] shrink-0" />
                <a href="mailto:hello@cakestyles.com" className="hover:text-[#461220] transition-colors">hello@cakestyles.com</a>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#c88242] shrink-0 mt-0.5" />
                <a
                  href="https://maps.app.goo.gl/F3eNhZa6Vgb3o128A"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#461220] hover:underline transition-colors"
                >
                  83/1/2, Sambhunath Pandit St, Bhowanipore, Kolkata 700020
                </a>
              </p>
            </div>
          </div>

        </div>

        {/* Bottom Sub-Footer */}
        <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#70293b]/70">
          <p>© 2026 Cakestyles. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/about" className="hover:underline">Privacy Policy</Link>
            <span>|</span>
            <Link to="/about" className="hover:underline">Terms & Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
