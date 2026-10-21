"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const PHOTOS = [
  ["/images/products/strawberry.webp", "Fresh strawberry cake"],
  ["/images/menu-items/assorted_4.png", "Signature brownie box"],
  ["/images/custom_creations_cake.jpg", "Floral celebration cake"],
  ["/images/products/raspberry.webp", "Raspberry cream cupcake"],
  ["/images/menu-items/black-forest.png", "Black forest gateau"],
  ["/images/menu-items/biscoff_pastry.png", "Biscoff pastry"],
  ["/images/products/chocolate.webp", "Chocolate celebration cake"],
  ["/images/products/vanilla.webp", "Vanilla cream cake"],
].map(([src, alt], index) => ({
  id: `photo-${index + 1}`,
  src,
  alt,
  rotation: [-12, -3, 10][index] ?? 0,
  x: [-45, 0, 45][index] ?? 0,
  y: [8, -14, 5][index] ?? 0,
  zIndex: 10 + index,
}));

const transition = { type: "spring", stiffness: 160, damping: 18, mass: 1 };

export default function ExpandableGallery() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const layoutGroupId = useId();
  const containerRef = useRef(null);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (isExpanded && containerRef.current && !containerRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isExpanded]);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return (
    <section className="relative w-full overflow-visible bg-[#fff9fa] px-4 py-14 sm:overflow-hidden sm:px-10 sm:py-20 lg:px-16">
      <LayoutGroup id={layoutGroupId}>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center">
          <div className="mb-8 flex w-full items-center justify-between sm:mb-10">
            <AnimatePresence>
              {isExpanded ? (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onClick={() => setIsExpanded(false)}
                  className="group z-20 flex items-center gap-2 text-sm font-medium text-[#70293b]"
                >
                  <span className="rounded-full bg-[#fae6ec] p-2 transition-colors group-hover:bg-[#f5d5df]"><ArrowLeft size={18} /></span>
                  Go back
                </motion.button>
              ) : <div />}
            </AnimatePresence>
            <div className="flex items-center gap-5">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[#461220] sm:text-3xl lg:text-4xl">A little sweetness on Instagram</h2>
              <a href="https://www.instagram.com/cakestyles/" target="_blank" rel="noreferrer" className="group hidden items-center gap-1.5 text-xs font-semibold text-[#461220] transition-colors hover:text-[#c88242] sm:flex sm:text-sm">
                Follow Us @cakestyles <ArrowRight size={16} className="text-[#c88242] transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>

          <motion.div ref={containerRef} layout className={isExpanded ? "grid w-full grid-cols-2 gap-3 px-1 sm:gap-5 lg:grid-cols-4" : "relative flex h-[390px] w-full items-center justify-center sm:h-[450px]"} transition={transition}>
            {PHOTOS.map((photo, index) => {
              const isPrimary = index < 3;
              if (!isPrimary && !isExpanded) return null;
              return (
                <motion.div
                  key={photo.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1, rotate: isExpanded ? 0 : photo.rotation, x: isExpanded ? 0 : photo.x, y: isExpanded ? 0 : photo.y, zIndex: isExpanded ? 1 : photo.zIndex }}
                  whileHover={canHover && !isExpanded ? {
                    scale: 1.05,
                    y: photo.y - 15,
                    rotate: photo.rotation * 0.8,
                    zIndex: 50,
                    transition: { type: "spring", stiffness: 400, damping: 25 },
                  } : canHover && isExpanded ? { scale: 1.02 } : undefined}
                  whileTap={{ scale: 0.97 }}
                  transition={transition}
                  onClick={() => !isExpanded && setIsExpanded(true)}
                  role={!isExpanded ? "button" : undefined}
                  tabIndex={!isExpanded ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!isExpanded && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setIsExpanded(true);
                    }
                  }}
                  className={isExpanded ? "group relative aspect-square overflow-hidden rounded-2xl border-2 border-[#461220]/15 bg-[#fae6ec] shadow-md sm:rounded-3xl" : "group absolute h-44 w-44 overflow-hidden rounded-[2rem] border-[5px] border-[#fff9fa] bg-[#fae6ec] shadow-[0_20px_50px_rgba(70,18,32,0.2)] sm:h-60 sm:w-60 sm:rounded-[2.5rem]"}
                >
                  <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" className="h-full w-full select-none object-cover transition-transform duration-500 group-hover:scale-110" />
                  <span className="absolute inset-0 flex items-center justify-center bg-[#461220]/35 text-white opacity-0 transition-opacity group-hover:opacity-100"><Camera size={25} /></span>
                </motion.div>
              );
            })}
          </motion.div>

          <AnimatePresence>
            {!isExpanded && (
              <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 flex flex-col items-center gap-5 text-center">
                <p className="max-w-xl font-display text-xl text-[#70293b] sm:text-2xl">Sweet moments, beautifully baked and shared with love.</p>
                <button type="button" onClick={() => setIsExpanded(true)} className="flex items-center gap-2 rounded-full bg-[#461220] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#340d18]">Explore our bakes <ArrowRight size={17} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </section>
  );
}
