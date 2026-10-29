// One place for every display format (main doc section 9: one date util).
export const CURRENCIES = [
  ["EUR", "€", "Euro"], ["USD", "$", "US Dollar"], ["GBP", "£", "British Pound"], ["BRL", "R$", "Brazilian Real"],
  ["RUB", "₽", "Russian Ruble"], ["CNY", "¥", "Chinese Yuan"], ["JPY", "¥", "Japanese Yen"], ["KRW", "₩", "South Korean Won"],
  ["TRY", "₺", "Turkish Lira"], ["KZT", "₸", "Kazakhstani Tenge"], ["UAH", "₴", "Ukrainian Hryvnia"], ["BYN", "Br", "Belarusian Ruble"],
  ["PLN", "zł", "Polish Zloty"], ["ILS", "₪", "Israeli Shekel"], ["ZAR", "R", "South African Rand"], ["CHF", "Fr", "Swiss Franc"],
  ["CAD", "$", "Canadian Dollar"], ["AUD", "$", "Australian Dollar"], ["INR", "₹", "Indian Rupee"], ["MXN", "$", "Mexican Peso"],
  ["SEK", "kr", "Swedish Krona"], ["CZK", "Kč", "Czech Koruna"],
] as const;

export const currencySymbol = (code: string) => CURRENCIES.find((c) => c[0] === code)?.[1] ?? code;

const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "13.43 €". compact=true drops decimals ("13 €") for dense tables. */
export function money(x: number | null | undefined, currency = "EUR", compact = false) {
  // round half-up first: Intl would turn the float 0.17499... (= 0.175) into 0.17
  const v = Number.isFinite(x) ? Math.round(((x as number) + Number.EPSILON) * 100) / 100 : 0;
  return `${compact ? fmt0.format(v) : fmt2.format(v)} ${currencySymbol(currency)}`;
}

export const pct = (x: number, digits = 1) => `${(Number.isFinite(x) ? x : 0).toFixed(digits)}%`;

export function grams(g: number) {
  return g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g * 10) / 10} g`;
}

/** minutes -> "11h 40m"; with days -> "1d 3h 5m" */
export function duration(min: number, withDays = false) {
  const total = Math.round(Math.max(0, min));
  const d = withDays ? Math.floor(total / 1440) : 0;
  const h = Math.floor((total - d * 1440) / 60);
  const m = total % 60;
  return `${d ? `${d}d ` : ""}${h}h ${m}m`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** dd.mm.yyyy for detail headers */
export const dateDot = (d: Date | string) => {
  const x = toDate(d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
};
/** dd.mm for stepper */
export const dateShort = (d: Date | string) => {
  const x = toDate(d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}`;
};
/** MM/DD/YYYY for tables and documents */
export const dateUS = (d: Date | string) => {
  const x = toDate(d);
  return `${pad(x.getMonth() + 1)}/${pad(x.getDate())}/${x.getFullYear()}`;
};
/** "October 27, 2026" for group headings */
export const dateLong = (d: Date | string) =>
  toDate(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** value for <input type="date"> */
export const dateInput = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = toDate(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Accepts "1,5" and "1.5" (main doc 9.1). Empty -> 0. */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}
