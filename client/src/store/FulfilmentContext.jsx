import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "cs_fulfilment";
const LEGACY_TYPE_KEY = "cs_fulfilment_pref";
const VALID_TYPES = new Set(["pickup", "delivery"]);

const FulfilmentContext = createContext(null);

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const emptyAddress = () => ({
  line1: "",
  line2: "",
  city: "",
  pincode: "",
});

const defaultFulfilment = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    type: "pickup",
    date: localDate(tomorrow),
    slot: "",
    address: emptyAddress(),
    confirmed: false,
  };
};

const cleanString = (value) => (typeof value === "string" ? value : "");

const normaliseFulfilment = (value) => {
  const fallback = defaultFulfilment();
  const source = value && typeof value === "object" ? value : {};
  const address = source.address && typeof source.address === "object" ? source.address : {};

  return {
    type: VALID_TYPES.has(source.type) ? source.type : fallback.type,
    date: /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : fallback.date,
    slot: cleanString(source.slot),
    address: {
      line1: cleanString(address.line1),
      line2: cleanString(address.line2),
      city: cleanString(address.city),
      pincode: cleanString(address.pincode),
    },
    confirmed: source.confirmed === true,
  };
};

const readStoredFulfilment = () => {
  const fallback = defaultFulfilment();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normaliseFulfilment(JSON.parse(stored));

    const legacyType = localStorage.getItem(LEGACY_TYPE_KEY);
    return legacyType === "delivery" ? { ...fallback, type: "delivery" } : fallback;
  } catch {
    return fallback;
  }
};

export function FulfilmentProvider({ children }) {
  const [fulfilment, setFulfilmentState] = useState(readStoredFulfilment);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fulfilment));
      localStorage.setItem(LEGACY_TYPE_KEY, fulfilment.type);
    } catch {
      // Storage can be unavailable in privacy mode; in-memory state still works.
    }
  }, [fulfilment]);

  const setFulfilment = useCallback((next) => {
    setFulfilmentState((current) =>
      normaliseFulfilment(typeof next === "function" ? next(current) : next),
    );
  }, []);

  const updateFulfilment = useCallback((updates) => {
    setFulfilmentState((current) => {
      const next = typeof updates === "function" ? updates(current) : updates;
      if (!next || typeof next !== "object") return current;

      return normaliseFulfilment({
        ...current,
        ...next,
        address: next.address
          ? { ...current.address, ...next.address }
          : current.address,
        confirmed: false,
      });
    });
  }, []);

  const setType = useCallback((type) => {
    if (!VALID_TYPES.has(type)) return;
    setFulfilmentState((current) => ({
      ...current,
      type,
      slot: current.type === type ? current.slot : "",
      confirmed: false,
    }));
  }, []);

  const setDate = useCallback((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setFulfilmentState((current) => ({ ...current, date, confirmed: false }));
  }, []);

  const setSlot = useCallback((slot) => {
    setFulfilmentState((current) => ({
      ...current,
      slot: cleanString(slot),
      confirmed: false,
    }));
  }, []);

  const setAddress = useCallback((address) => {
    setFulfilmentState((current) => ({
      ...current,
      address: {
        ...current.address,
        ...(typeof address === "function" ? address(current.address) : address),
      },
    }));
  }, []);

  const updateAddress = useCallback((field, value) => {
    if (!Object.hasOwn(emptyAddress(), field)) return;
    setFulfilmentState((current) => ({
      ...current,
      address: { ...current.address, [field]: cleanString(value) },
    }));
  }, []);

  const confirmFulfilment = useCallback((updates = {}) => {
    setFulfilmentState((current) => {
      const next = typeof updates === "function" ? updates(current) : updates;
      const safeUpdates = next && typeof next === "object" ? next : {};

      return normaliseFulfilment({
        ...current,
        ...safeUpdates,
        address: safeUpdates.address
          ? { ...current.address, ...safeUpdates.address }
          : current.address,
        confirmed: true,
      });
    });
  }, []);

  const resetFulfilment = useCallback(() => {
    setFulfilmentState(defaultFulfilment());
  }, []);

  const value = useMemo(
    () => ({
      fulfilment,
      ...fulfilment,
      fulfilmentType: fulfilment.type,
      setFulfilment,
      updateFulfilment,
      setType,
      setFulfilmentType: setType,
      setDate,
      setSlot,
      setAddress,
      updateAddress,
      confirmFulfilment,
      confirm: confirmFulfilment,
      resetFulfilment,
      reset: resetFulfilment,
    }),
    [
      confirmFulfilment,
      fulfilment,
      resetFulfilment,
      setAddress,
      setDate,
      setFulfilment,
      setSlot,
      setType,
      updateAddress,
      updateFulfilment,
    ],
  );

  return <FulfilmentContext.Provider value={value}>{children}</FulfilmentContext.Provider>;
}

// The provider and its hook intentionally share this module as a single public API.
// eslint-disable-next-line react-refresh/only-export-components
export function useFulfilment() {
  const context = useContext(FulfilmentContext);
  if (!context) {
    throw new Error("useFulfilment must be used within a FulfilmentProvider");
  }
  return context;
}
