export const DEFAULT_CURRENCY = "SGD";

export const CURRENCIES = [
  { code: "SGD", symbol: "S$", name: "Singapore dollar", fractionDigits: 2 },
  { code: "USD", symbol: "$", name: "US dollar", fractionDigits: 2 },
  { code: "EUR", symbol: "€", name: "Euro", fractionDigits: 2 },
  { code: "GBP", symbol: "£", name: "British pound", fractionDigits: 2 },
  { code: "INR", symbol: "₹", name: "Indian rupee", fractionDigits: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese yen", fractionDigits: 0 },
  { code: "AUD", symbol: "A$", name: "Australian dollar", fractionDigits: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian dollar", fractionDigits: 2 },
  { code: "CHF", symbol: "CHF", name: "Swiss franc", fractionDigits: 2 },
  { code: "THB", symbol: "฿", name: "Thai baht", fractionDigits: 2 },
  { code: "IDR", symbol: "Rp", name: "Indonesian rupiah", fractionDigits: 0 },
  { code: "MYR", symbol: "RM", name: "Malaysian ringgit", fractionDigits: 2 },
];

const CURRENCY_BY_CODE = Object.fromEntries(CURRENCIES.map((currency) => [currency.code, currency]));
const LEGACY_SYMBOL_CODES = {
  "$": "USD",
  "S$": "SGD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
  "A$": "AUD",
  "C$": "CAD",
};

export function currencyFor(code) {
  return CURRENCY_BY_CODE[code] || CURRENCY_BY_CODE[DEFAULT_CURRENCY];
}

export function normalizeCurrencyCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  return CURRENCY_BY_CODE[raw] ? raw : LEGACY_SYMBOL_CODES[value] || DEFAULT_CURRENCY;
}

export function minorUnitFactor(currencyCode) {
  return 10 ** currencyFor(currencyCode).fractionDigits;
}

export function toMinorUnits(amount, currencyCode) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 0;
  return Math.round(numericAmount * minorUnitFactor(currencyCode));
}

export function fromMinorUnits(amountMinor, currencyCode) {
  const numericAmount = Number(amountMinor);
  if (!Number.isFinite(numericAmount)) return 0;
  return numericAmount / minorUnitFactor(currencyCode);
}

export function formatMoney(amountMinor, currencyCode, { signed = false } = {}) {
  const currency = currencyFor(currencyCode);
  const amount = fromMinorUnits(Math.abs(amountMinor), currency.code);
  const formatted = `${currency.symbol}${amount.toFixed(currency.fractionDigits)}`;
  if (!signed) return formatted;
  if (Math.abs(amountMinor) < 1) return `${currency.symbol}${(0).toFixed(currency.fractionDigits)}`;
  return `${amountMinor < 0 ? "-" : "+"}${formatted}`;
}

export function convertedAmountMinor(expense, targetCurrency = DEFAULT_CURRENCY) {
  const target = normalizeCurrencyCode(targetCurrency);
  const expenseCurrency = normalizeCurrencyCode(expense?.currency);
  const amountMinor = Number(expense?.amountMinor);

  if (!Number.isFinite(amountMinor)) {
    const legacyAmount = Number(expense?.amount);
    if (!Number.isFinite(legacyAmount)) return null;
    const legacyCurrency = normalizeCurrencyCode(expense?.currency || target);
    if (legacyCurrency !== target) return null;
    return toMinorUnits(legacyAmount, target);
  }

  if (expenseCurrency === target) return amountMinor;

  const rate = Number(expense?.fx?.rate);
  if (!Number.isFinite(rate) || rate <= 0 || normalizeCurrencyCode(expense?.fx?.to) !== target) return null;

  const originalAmount = fromMinorUnits(amountMinor, expenseCurrency);
  return toMinorUnits(originalAmount * rate, target);
}

export function expenseStatus(expense, targetCurrency = DEFAULT_CURRENCY) {
  return convertedAmountMinor(expense, targetCurrency) === null ? "fx_pending" : "ready";
}

export function calculateTotalMinor(state) {
  const targetCurrency = normalizeCurrencyCode(state?.currency);
  return (Array.isArray(state?.expenses) ? state.expenses : []).reduce((total, expense) => {
    return total + (convertedAmountMinor(expense, targetCurrency) || 0);
  }, 0);
}

export function calculateBalances(state) {
  const people = Array.isArray(state?.people) ? state.people : [];
  const expenses = Array.isArray(state?.expenses) ? state.expenses : [];
  const balances = Object.fromEntries(people.map((person) => [person.id, 0]));
  const targetCurrency = normalizeCurrencyCode(state?.currency);

  for (const expense of expenses) {
    if (!Object.prototype.hasOwnProperty.call(balances, expense.payerId) || expense.splitWith.length === 0) continue;
    const amountMinor = convertedAmountMinor(expense, targetCurrency);
    if (amountMinor === null) continue;
    balances[expense.payerId] += amountMinor;
    const share = amountMinor / expense.splitWith.length;
    for (const personId of expense.splitWith) {
      if (Object.prototype.hasOwnProperty.call(balances, personId)) balances[personId] -= share;
    }
  }

  return balances;
}

export function calculateSettlements(balances) {
  const debtors = [];
  const creditors = [];

  for (const [personId, balance] of Object.entries(balances)) {
    if (balance < -0.5) debtors.push({ personId, amount: -balance });
    if (balance > 0.5) creditors.push({ personId, amount: balance });
  }

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from: debtor.personId,
      to: creditor.personId,
      amount,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.5) debtorIndex += 1;
    if (creditor.amount < 0.5) creditorIndex += 1;
  }

  return settlements;
}
