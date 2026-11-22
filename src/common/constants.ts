// TODO: move these to the Setting table when an admin panel exists.
export const STALE_LOCATION_SEC = 90; // vendor hidden from customers if no update for this long
export const AUTO_OFFLINE_SEC = 600; // vendor forced offline after this long without any update
export const NEARBY_RADIUS_M = 3000;
export const MIN_PRICE_PAISE = 1000; // Rs 10 per can
export const MAX_PRICE_PAISE = 20000; // Rs 200 per can
export const MAX_SAVED_ADDRESSES = 10;

// ---- orders and dispatch ----
export const DEFAULT_PRICE_PAISE = 2000; // used only for the customer's estimate, Rs 20 per can
export const MAX_CANS_PER_ORDER = 20;
export const OFFER_TIMEOUT_SEC = 45; // how long one vendor has to accept
export const MAX_OFFER_ATTEMPTS = 5; // no longer used by dispatch, safe to keep
export const SEARCH_TIMEOUT_SEC = 900; // an order keeps searching for up to 15 minutes
export const REOFFER_COOLDOWN_SEC = 120; // a vendor who did not answer can be asked again after this
export const CART_SPEED_KMH = 3.5; // a vendor pushing a thela through narrow lanes
