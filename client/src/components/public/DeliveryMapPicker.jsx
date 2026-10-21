import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin } from "lucide-react";

const STORE_ORIGIN = { lat: 19.076, lng: 72.8777 };
const RATE_PER_KM = 18;

const haversineKm = (a, b) => {
  const earth = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function DeliveryMapPicker({ value, onChange }) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) { setError("Map selection is unavailable until the store map key is configured. You can still enter your address below."); return undefined; }
    if (window.google?.maps) { setReady(true); return undefined; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true; script.defer = true; script.onload = () => setReady(true); script.onerror = () => setError("The map could not load. Please enter your address below.");
    document.head.appendChild(script);
    return () => { script.onload = null; };
  }, []);

  /* Map instance listeners intentionally bind to the selected point once per map mount. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return undefined;
    const selected = value.latitude && value.longitude ? { lat: value.latitude, lng: value.longitude } : STORE_ORIGIN;
    const map = new window.google.maps.Map(mapRef.current, { center: selected, zoom: value.latitude ? 14 : 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false });
    markerRef.current = new window.google.maps.Marker({ map, position: selected, draggable: true, title: "Delivery location" });
    const select = (latLng) => {
      const point = { lat: latLng.lat(), lng: latLng.lng() };
      const distanceKm = Number(haversineKm(STORE_ORIGIN, point).toFixed(2));
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: point }, (results, status) => {
        const components = status === "OK" && results?.[0]?.address_components ? results[0].address_components : [];
        const get = (type) => components.find((item) => item.types.includes(type))?.long_name || "";
        onChange({ latitude: point.lat, longitude: point.lng, distanceKm, line1: results?.[0]?.formatted_address || value.line1, city: get("locality") || get("administrative_area_level_2") || value.city, pincode: get("postal_code") || value.pincode });
      });
    };
    map.addListener("click", (event) => { markerRef.current.setPosition(event.latLng); select(event.latLng); });
    markerRef.current.addListener("dragend", (event) => select(event.latLng));
    return () => { window.google.maps.event.clearInstanceListeners(map); window.google.maps.event.clearInstanceListeners(markerRef.current); };
  }, [ready]);

  const locate = () => {
    if (!navigator.geolocation) { setError("Location access is not available in this browser."); return; }
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      onChange({ latitude: point.lat, longitude: point.lng, distanceKm: Number(haversineKm(STORE_ORIGIN, point).toFixed(2)) });
      setLoading(false);
    }, () => { setError("We could not access your location. Please choose on the map or enter the address."); setLoading(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  return <div className="space-y-2"><div ref={mapRef} className="relative h-48 overflow-hidden rounded-2xl border border-wine-100 bg-cream-100">{!ready && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-cocoa-500"><MapPin className="h-6 w-6 text-wine-600" />{error || "Loading map…"}</div>}</div><button type="button" onClick={locate} className="inline-flex items-center gap-2 rounded-full border border-wine-200 bg-white px-4 py-2 text-xs font-semibold text-wine-700 transition hover:bg-wine-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my current location</button>{value.distanceKm > 0 && <p className="text-xs text-cocoa-500">Selected delivery point · {value.distanceKm.toFixed(1)} km away</p>}{error && ready && <p className="text-xs text-wine-700">{error}</p>}</div>;
}

export { RATE_PER_KM };
