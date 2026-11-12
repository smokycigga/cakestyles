// Razorpay checkout, fetched the first time someone actually chooses to pay
// online. It used to be a synchronous <script> in index.html, so every visitor
// — including the ones who only came to look at the menu — paid for a
// third-party DNS lookup, TLS handshake and download before the page could
// finish rendering.
const SRC = "https://checkout.razorpay.com/v1/checkout.js";

let pending = null;

export const loadRazorpay = () => {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay checkout needs a browser"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay checkout could not be loaded"));
    };
    script.onerror = () => {
      // Let a later attempt retry instead of caching the failure forever.
      pending = null;
      script.remove();
      reject(new Error("Razorpay checkout could not be loaded"));
    };
    document.body.appendChild(script);
  });

  return pending;
};

export default loadRazorpay;
