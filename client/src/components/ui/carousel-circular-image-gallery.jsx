import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.registerPlugin(MotionPathPlugin);

const images = [
  { title: "Custom creation one", url: "/images/gallery/gallery1.jpg" },
  { title: "Custom creation two", url: "/images/gallery/gallery2.jpg" },
  { title: "Custom creation three", url: "/images/gallery/gallery3.jpg" },
  { title: "Custom creation four", url: "/images/gallery/gallery4.jpg" },
  { title: "Custom creation five", url: "/images/gallery/gallery5.jpg" },
  { title: "Custom creation six", url: "/images/gallery/gallery6.jpg" },
];

export default function CircularImageGallery() {
  const [opened, setOpened] = useState(0);
  const [inPlace, setInPlace] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const autoplayTimer = useRef(null);

  const onClick = (index) => { if (!disabled) setOpened(index); };
  const next = useCallback(() => setOpened((current) => (current + 1) % images.length), []);
  const prev = useCallback(() => setOpened((current) => (current - 1 + images.length) % images.length), []);

  useEffect(() => setDisabled(true), [opened]);
  useEffect(() => setDisabled(false), [inPlace]);
  useEffect(() => {
    autoplayTimer.current = window.setInterval(next, 4500);
    return () => window.clearInterval(autoplayTimer.current);
  }, [opened, next]);

  return (
    <div className="relative flex min-h-[360px] w-full items-center justify-center">
      <div className="relative h-[min(78vw,320px)] w-[min(78vw,320px)] overflow-hidden rounded-[20px] shadow-[0_18px_42px_rgba(70,18,32,0.16)]">
        {images.map((image, i) => (
          <div key={image.url} className="absolute left-0 top-0 h-full w-full" style={{ zIndex: inPlace === i ? i : images.length + 1 }}>
            <GalleryImage total={images.length} id={i} url={image.url} title={image.title} open={opened === i} inPlace={inPlace === i} onInPlace={setInPlace} />
          </div>
        ))}
        <div className="pointer-events-none absolute left-0 top-0 z-[100] h-full w-full"><Tabs images={images} onSelect={onClick} /></div>
      </div>
      <button type="button" onClick={prev} disabled={disabled} aria-label="Previous image" className="absolute left-0 top-1/2 z-[101] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#eed3db] bg-white text-[#461220] shadow-md transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={22} /></button>
      <button type="button" onClick={next} disabled={disabled} aria-label="Next image" className="absolute right-0 top-1/2 z-[101] flex h-10 w-10 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#eed3db] bg-white text-[#461220] shadow-md transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={22} /></button>
    </div>
  );
}

function GalleryImage({ url, title, open, inPlace, id, onInPlace, total }) {
  const firstLoad = useRef(true);
  const clip = useRef(null);
  const gap = 10;
  const circleRadius = 7;
  const defaults = { transformOrigin: "center center" };
  const duration = 0.4;
  const width = 400;
  const height = 400;
  const scale = 700;
  const bigSize = circleRadius * scale;
  const getPosSmall = () => ({ cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap), cy: height - 30, r: circleRadius });
  const getPosSmallAbove = () => ({ cx: width / 2 - (total * (circleRadius * 2 + gap) - gap) / 2 + id * (circleRadius * 2 + gap), cy: height / 2, r: circleRadius * 2 });
  const getPosCenter = () => ({ cx: width / 2, cy: height / 2, r: circleRadius * 7 });
  // Keep the selected image centered in the card; the original side-travel
  // path is retained for the closing animation and thumbnail choreography.
  const getPosEnd = () => ({ cx: width / 2, cy: height / 2, r: bigSize });
  const getPosStart = () => ({ cx: width / 2 + bigSize, cy: height / 2, r: bigSize });

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!clip.current) return;
    const initial = firstLoad.current;
    firstLoad.current = false;
    const flipDuration = initial ? 0 : duration;
    const upDuration = initial ? 0 : 0.2;
    const bounceDuration = initial ? 0.01 : 1;
    const delay = initial ? 0 : flipDuration + upDuration;
    if (open) {
      gsap.timeline().set(clip.current, { ...defaults, ...getPosSmall() }).to(clip.current, { ...defaults, ...getPosCenter(), duration: upDuration, ease: "power3.inOut" }).to(clip.current, { ...defaults, ...getPosEnd(), duration: flipDuration, ease: "power4.in", onComplete: () => onInPlace(id) });
    } else {
      gsap.timeline({ overwrite: true }).set(clip.current, { ...defaults, ...getPosStart() }).to(clip.current, { ...defaults, ...getPosCenter(), delay, duration: flipDuration, ease: "power4.out" }).to(clip.current, { ...defaults, motionPath: { path: [getPosSmallAbove(), getPosSmall()], curviness: 1 }, duration: bounceDuration, ease: "bounce.out" });
    }
  }, [open]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-label={title}><defs><clipPath id={`${id}_circleClip`}><circle cx="0" cy="0" r={circleRadius} ref={clip} /></clipPath><clipPath id={`${id}_squareClip`}><rect width={width} height={height} /></clipPath></defs><g clipPath={`url(#${id}${inPlace ? "_squareClip" : "_circleClip"})`}><image width={width} height={height} href={url} className="pointer-events-none" /></g></svg>;
}

function Tabs({ images: tabImages, onSelect }) {
  const gap = 10; const circleRadius = 7; const width = 400; const height = 400;
  const getPosX = (i) => width / 2 - (tabImages.length * (circleRadius * 2 + gap) - gap) / 2 + i * (circleRadius * 2 + gap);
  const getPosY = () => height - 30;
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full">{tabImages.map((image, i) => <g key={image.url} className="pointer-events-auto"><image x={getPosX(i) - circleRadius} y={getPosY() - circleRadius} width={circleRadius * 2} height={circleRadius * 2} href={image.url} className="pointer-events-none" preserveAspectRatio="xMidYMid slice" /><circle onClick={() => onSelect(i)} className="cursor-pointer fill-white/0 stroke-white/70 transition-all hover:stroke-white" strokeWidth="2" cx={getPosX(i)} cy={getPosY()} r={circleRadius + 2} /></g>)}</svg>;
}
