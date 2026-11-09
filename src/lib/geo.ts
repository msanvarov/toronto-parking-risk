/** Turn the phone's GPS position into a street address via OpenStreetMap. */

export interface Located {
  number: number | null;
  street: string; // as OSM spells it, e.g. "College Street"
}

export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Location isn't available on this device."));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

export async function reverseGeocode(lat: number, lon: number): Promise<Located> {
  // Nominatim usage policy: max 1 request/second, identify the app. We only
  // call this when the user taps "Use my location".
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Couldn't look up your street.");
  const data = await res.json();
  const a = data.address ?? {};
  const street: string | undefined = a.road ?? a.pedestrian ?? a.residential;
  if (!street) throw new Error("Couldn't find a street at your location.");
  const n = parseInt(a.house_number ?? "", 10);
  return { number: Number.isFinite(n) ? n : null, street };
}

export function locationErrorMessage(err: unknown): string {
  if (typeof GeolocationPositionError !== "undefined" && err instanceof GeolocationPositionError) {
    if (err.code === err.PERMISSION_DENIED) return "Location permission was denied. Type your street instead.";
    if (err.code === err.TIMEOUT) return "Finding your location took too long. Try again or type your street.";
  }
  return err instanceof Error ? err.message : "Couldn't get your location.";
}
