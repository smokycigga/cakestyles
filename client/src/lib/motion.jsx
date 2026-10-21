/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* Lenis smooth scrolling, synced with ScrollTrigger                    */
/* ------------------------------------------------------------------ */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    // Refresh ScrollTrigger after layout settles
    const timer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);

    return () => {
      clearTimeout(timer);
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
    };
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/* Preloader — brand wordmark reveal, then curtain lift                 */
/* ------------------------------------------------------------------ */
export function Preloader() {
  const [done, setDone] = useState(false);
  const root = useRef(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        setDone(true);
        return;
      }
      const tl = gsap.timeline({
        onComplete: () => setDone(true),
      });
      tl.fromTo(
        ".pl-letter",
        { yPercent: 120, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.05, ease: "power4.out" }
      )
        .fromTo(".pl-line", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power2.inOut" }, "-=0.3")
        .to(".pl-inner", { yPercent: -30, opacity: 0, duration: 0.5, ease: "power2.in", delay: 0.25 })
        .to(root.current, { yPercent: -100, duration: 0.7, ease: "power4.inOut" }, "-=0.15");
    },
    { scope: root }
  );

  if (done) return null;
  return (
    <div ref={root} className="fixed inset-0 z-[100] bg-wine-900 flex items-center justify-center">
      <div className="pl-inner text-center">
        <div className="overflow-hidden">
          <div className="font-display text-5xl sm:text-6xl text-cream-50 flex">
            {"Cakestyles".split("").map((ch, i) => (
              <span key={i} className="pl-letter inline-block">
                {ch}
              </span>
            ))}
          </div>
        </div>
        <div className="pl-line h-px w-48 mx-auto mt-4 bg-gold-400 origin-left" />
        <p className="text-[10px] tracking-[0.4em] uppercase text-blush-200/60 mt-4">Handcrafted with love</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SplitHeading — serif headline with *italic gold accents*, char reveal */
/* ------------------------------------------------------------------ */
const parseAccents = (text) => {
  // "Cakes worth *celebrating*" → [{t:"Cakes worth ",a:false},{t:"celebrating",a:true},...]
  const parts = String(text).split("*");
  return parts.map((t, i) => ({ t, a: i % 2 === 1 })).filter((p) => p.t.length);
};

export function SplitHeading({ text, as: Tag = "h2", className = "", delay = 0, animate = true }) {
  const root = useRef(null);

  useGSAP(
    () => {
      if (!animate) return;
      gsap.fromTo(
        root.current.querySelectorAll(".sh-char"),
        { yPercent: 115 },
        {
          yPercent: 0,
          duration: 0.9,
          stagger: 0.018,
          ease: "power4.out",
          delay,
          scrollTrigger: !root.current.closest("section[data-hero]")
            ? { trigger: root.current, start: "top 88%", once: true }
            : undefined,
        }
      );
    },
    { scope: root }
  );

  const rendered = parseAccents(text).map((seg, si) =>
    seg.t.split(" ").map((word, wi) =>
      word ? (
        <span key={`${si}-${wi}`} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
          <span className={`inline-block ${seg.a ? "font-display italic text-gold-500 sh-word" : "sh-word"}`}>
            {word.split("").map((ch, ci) => (
              <span key={ci} className="sh-char inline-block will-change-transform">
                {ch}
              </span>
            ))}
            {"\u00A0"}
          </span>
        </span>
      ) : null
    )
  );

  return <Tag ref={root} className={className}>{rendered}</Tag>;
}

/* ------------------------------------------------------------------ */
/* Reveal — fade/slide up on scroll                                     */
/* ------------------------------------------------------------------ */
export function Reveal({ children, delay = 0, y = 36, className = "", once = true }) {
  const root = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        root.current,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          delay,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 90%", once },
        }
      );
    },
    { scope: root }
  );
  return (
    <div ref={root} className={className} style={prefersReducedMotion() ? undefined : { opacity: 0 }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Parallax — moves at its own speed while scrolling past               */
/* ------------------------------------------------------------------ */
export function Parallax({ children, speed = 0.15, className = "" }) {
  const root = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        root.current,
        { yPercent: -speed * 100 },
        {
          yPercent: speed * 100,
          ease: "none",
          scrollTrigger: { trigger: root.current.parentElement, start: "top bottom", end: "bottom top", scrub: 1 },
        }
      );
    },
    { scope: root }
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ScrollVideo — scrubs a muted hero video with page scroll             */
/* ------------------------------------------------------------------ */
export function ScrollVideo({ src, className = "", poster }) {
  const videoRef = useRef(null);
  const root = useRef(null);

  useGSAP(() => {
    const video = videoRef.current;
    if (!video || prefersReducedMotion()) return;

    const syncDuration = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      gsap.to(video, {
        currentTime: video.duration,
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      });
    };

    if (video.readyState >= 1) syncDuration();
    else video.addEventListener("loadedmetadata", syncDuration, { once: true });
    return () => video.removeEventListener("loadedmetadata", syncDuration);
  }, { scope: root });

  return (
    <div ref={root} className={className} aria-hidden="true">
      <video ref={videoRef} src={src} poster={poster} muted playsInline preload="auto" className="h-full w-full object-cover" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MagneticButton — gravitates toward the cursor                        */
/* ------------------------------------------------------------------ */
export function MagneticButton({ children, className = "", ...props }) {
  const root = useRef(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const el = root.current;
      const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
      const move = (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.28);
      };
      const leave = () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
      };
      el.addEventListener("mousemove", move);
      el.addEventListener("mouseleave", leave);
      return () => {
        el.removeEventListener("mousemove", move);
        el.removeEventListener("mouseleave", leave);
      };
    },
    { scope: root }
  );
  return (
    <button ref={root} className={`inline-block will-change-transform ${className}`} {...props}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Counter — counts up when scrolled into view                          */
/* ------------------------------------------------------------------ */
export function Counter({ to, suffix = "", duration = 2 }) {
  const numRef = useRef(null);
  useGSAP(() => {
    if (prefersReducedMotion()) {
      numRef.current.textContent = to + suffix;
      return;
    }
    const obj = { v: 0 };
    gsap.to(obj, {
      v: to,
      duration,
      ease: "power2.out",
      scrollTrigger: { trigger: numRef.current, start: "top 90%", once: true },
      onUpdate: () => {
        numRef.current.textContent = Math.round(obj.v).toLocaleString("en-IN") + suffix;
      },
    });
  }, []);
  return <span ref={numRef}>0{suffix}</span>;
}

/* ------------------------------------------------------------------ */
/* Marquee — infinite ribbon                                            */
/* ------------------------------------------------------------------ */
export function Marquee({ items, className = "", speed = 26 }) {
  const row = [...items, ...items];
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div className="inline-flex animate-marquee" style={{ animationDuration: `${speed}s` }}>
        {row.map((item, i) => (
          <span key={i} className="inline-flex items-center">
            <span className="mx-6">{item}</span>
            <span className="text-gold-400">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RotatingBadge — circular text, slowly spinning                       */
/* ------------------------------------------------------------------ */
export function RotatingBadge({ text = "100% VEG · EGGLESS · FRESH DAILY · ", className = "" }) {
  return (
    <div className={`relative w-28 h-28 ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full animate-spin-slow">
        <defs>
          <path id="circlePath" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
        </defs>
        <text className="fill-cream-50" style={{ fontSize: "9.2px", letterSpacing: "2.6px" }}>
          <textPath href="#circlePath">{text}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl">🧁</span>
      </div>
    </div>
  );
}
