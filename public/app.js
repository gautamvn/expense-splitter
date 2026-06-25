import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  calculateBalances as calculateBalancesForState,
  calculateSettlements as calculateSettlementsForBalances,
  calculateTotalMinor,
  convertedAmountMinor,
  currencyFor,
  expenseStatus,
  formatMoney,
  fromMinorUnits,
  normalizeCurrencyCode,
  toMinorUnits,
} from "./trip-math.js";

const STORAGE_KEY = "trip-split-state-v2";
const TRIP_KEY = "trip-split-active-trip-v2";

const defaultState = {
  schemaVersion: 2,
  version: 0,
  name: "Trip",
  currency: DEFAULT_CURRENCY,
  people: [],
  expenses: [],
};

let state = structuredClone(defaultState);
let tripId = null;
let editingExpenseId = null;
let isSaving = false;
let activeView = "dashboard";
const expandedLedgerDates = new Set();
const useRemoteState = location.protocol.startsWith("http") && !new URLSearchParams(location.search).has("local");

const els = {
  tripGate: document.querySelector("#tripGate"),
  tripApp: document.querySelector("#tripApp"),
  createTripForm: document.querySelector("#createTripForm"),
  createTripName: document.querySelector("#createTripName"),
  createCurrency: document.querySelector("#createCurrency"),
  createParticipants: document.querySelector("#createParticipants"),
  openTripForm: document.querySelector("#openTripForm"),
  openTripInput: document.querySelector("#openTripInput"),
  switchTripButton: document.querySelector("#switchTripButton"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  tripTitle: document.querySelector("#tripTitle"),
  statusText: document.querySelector("#statusText"),
  summaryGrid: document.querySelector(".summary-grid"),
  dashboardView: document.querySelector("#dashboardView"),
  settingsView: document.querySelector("#settingsView"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
  backToDashboardButton: document.querySelector("#backToDashboardButton"),
  pendingFxPanel: document.querySelector("#pendingFxPanel"),
  pendingMetric: document.querySelector("#pendingMetric"),
  retryFxButton: document.querySelector("#retryFxButton"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseFormTitle: document.querySelector("#expenseFormTitle"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  saveExpenseButton: document.querySelector("#saveExpenseButton"),
  descriptionInput: document.querySelector("#descriptionInput"),
  amountInput: document.querySelector("#amountInput"),
  expenseCurrencySelect: document.querySelector("#expenseCurrencySelect"),
  expenseDateInput: document.querySelector("#expenseDateInput"),
  payerSelect: document.querySelector("#payerSelect"),
  splitWithList: document.querySelector("#splitWithList"),
  balancesList: document.querySelector("#balancesList"),
  settlementsList: document.querySelector("#settlementsList"),
  expenseList: document.querySelector("#expenseList"),
  pendingCount: document.querySelector("#pendingCount"),
  copyBalancesButton: document.querySelector("#copyBalancesButton"),
  copySettlementsButton: document.querySelector("#copySettlementsButton"),
  downloadCsvButton: document.querySelector("#downloadCsvButton"),
  settingsForm: document.querySelector("#settingsForm"),
  tripNameInput: document.querySelector("#tripNameInput"),
  tripCurrencySelect: document.querySelector("#tripCurrencySelect"),
  newParticipantInput: document.querySelector("#newParticipantInput"),
  addParticipantButton: document.querySelector("#addParticipantButton"),
  peopleEditor: document.querySelector("#peopleEditor"),
  emptyTemplate: document.querySelector("#emptyStateTemplate"),
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const AVATAR_COLORS = ["#E8902A", "#D9533C", "#A9742F", "#C77D52", "#B5803A", "#C2552F", "#9C6B3F", "#D98236"];

function initialFor(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function colorFor(id) {
  const text = String(id);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarFor(person) {
  const span = document.createElement("span");
  span.className = "avatar";
  span.style.background = colorFor(person?.id);
  span.textContent = initialFor(person?.name);
  return span;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function localStorageKey(id = tripId) {
  return id ? `${STORAGE_KEY}:${id}` : STORAGE_KEY;
}

function populateCurrencySelect(select, selected = DEFAULT_CURRENCY) {
  select.replaceChildren(
    ...CURRENCIES.map((currency) => {
      const option = document.createElement("option");
      option.value = currency.code;
      option.textContent = `${currency.code} ${currency.symbol}`;
      option.selected = currency.code === selected;
      return option;
    }),
  );
}

function parseParticipantNames(value) {
  const seen = new Set();
  const names = [];
  for (const name of value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function tripUrl(id = tripId) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  if (id) url.searchParams.set("trip", id);
  return url.toString();
}

function tripIdFromInput(value) {
  const clean = value.trim();
  const isLegacyPasswordHash = (id) => /^[a-f0-9]{64}$/i.test(id);
  const isPrivateTripId = (id) => /^[a-zA-Z0-9_-]{24,96}$/.test(id) && !isLegacyPasswordHash(id);
  try {
    const url = new URL(clean);
    const id = url.searchParams.get("trip") || url.hash.replace(/^#trip=/, "");
    return isPrivateTripId(id) ? id : null;
  } catch {
    return isPrivateTripId(clean) ? clean : null;
  }
}

function migrateState(input) {
  const currency = normalizeCurrencyCode(input?.currency);
  const people = Array.isArray(input?.people) ? input.people : [];
  return {
    ...defaultState,
    ...input,
    schemaVersion: 2,
    currency,
    people,
    expenses: (Array.isArray(input?.expenses) ? input.expenses : []).map((expense) => {
      const expenseCurrency = normalizeCurrencyCode(expense.currency || currency);
      const amountMinor = Number.isInteger(expense.amountMinor) ? expense.amountMinor : toMinorUnits(Number(expense.amount || 0), expenseCurrency);
      return {
        id: expense.id || uid(),
        description: expense.description || "Expense",
        amountMinor,
        currency: expenseCurrency,
        payerId: expense.payerId,
        splitWith: Array.isArray(expense.splitWith) ? expense.splitWith : [],
        date: expense.date || (expense.createdAt || today()).slice(0, 10),
        fx: expense.fx || (expenseCurrency === currency ? { from: expenseCurrency, to: currency, rate: 1, date: expense.date || today(), source: "same-currency" } : null),
        createdAt: expense.createdAt || new Date().toISOString(),
        updatedAt: expense.updatedAt || expense.createdAt || new Date().toISOString(),
      };
    }),
  };
}

async function loadState(id) {
  if (useRemoteState) {
    const response = await fetch(`/api/state?tripId=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 404 ? "Trip not found" : "Could not open trip");
    const payload = await response.json();
    return migrateState(payload.state);
  }

  const local = JSON.parse(localStorage.getItem(localStorageKey(id)) || "null");
  if (!local) throw new Error("Trip not found");
  return migrateState(local);
}

async function saveState() {
  if (!tripId || isSaving) return;
  isSaving = true;
  const previousVersion = state.version;

  try {
    if (useRemoteState) {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, version: previousVersion, state }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.state) {
        state = migrateState(payload.state);
        alert("This trip changed in another tab or device. I reloaded the latest version; please retry your edit.");
        render();
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Save failed");
      state = migrateState(payload.state);
    } else {
      state.version += 1;
    }

    localStorage.setItem(localStorageKey(), JSON.stringify(state));
    localStorage.setItem(TRIP_KEY, JSON.stringify({ tripId }));
    history.replaceState(null, "", `?trip=${encodeURIComponent(tripId)}`);
  } catch (error) {
    alert(error.message || "Save failed");
  } finally {
    isSaving = false;
  }
}

async function createTrip(name, participantText, currency) {
  const names = parseParticipantNames(participantText);
  if (!name.trim() || names.length < 2) {
    alert("Add a trip name and at least two people.");
    return;
  }

  const nextState = {
    ...structuredClone(defaultState),
    name: name.trim(),
    currency: normalizeCurrencyCode(currency),
    people: names.map((personName) => ({ id: uid(), name: personName })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (useRemoteState) {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextState),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Trip creation failed");
    tripId = payload.tripId;
    state = migrateState(payload.state);
  } else {
    tripId = uid().replaceAll("-", "");
    state = nextState;
    state.version = 1;
  }

  localStorage.setItem(localStorageKey(), JSON.stringify(state));
  localStorage.setItem(TRIP_KEY, JSON.stringify({ tripId }));
  history.replaceState(null, "", `?trip=${encodeURIComponent(tripId)}`);
  showTripApp();
}

async function openTripFromId(id) {
  tripId = id;
  state = await loadState(id);
  localStorage.setItem(localStorageKey(), JSON.stringify(state));
  localStorage.setItem(TRIP_KEY, JSON.stringify({ tripId }));
  history.replaceState(null, "", `?trip=${encodeURIComponent(tripId)}`);
  showTripApp();
}

async function openTrip(value) {
  const directTripId = tripIdFromInput(value);
  if (directTripId) {
    await openTripFromId(directTripId);
    return;
  }

  throw new Error("Paste the private trip link.");
}

function showTripGate() {
  tripId = null;
  editingExpenseId = null;
  expandedLedgerDates.clear();
  activeView = "dashboard";
  state = structuredClone(defaultState);
  localStorage.removeItem(TRIP_KEY);
  history.replaceState(null, "", location.pathname);
  els.tripApp.classList.add("hidden");
  els.tripGate.classList.remove("hidden");
  els.openTripInput.focus();
}

function showTripApp() {
  els.tripGate.classList.add("hidden");
  els.tripApp.classList.remove("hidden");
  showDashboard();
  render();
}

function showDashboard() {
  activeView = "dashboard";
  els.dashboardView.classList.remove("hidden");
  els.settingsView.classList.add("hidden");
}

function showSettings() {
  activeView = "settings";
  els.dashboardView.classList.add("hidden");
  els.settingsView.classList.remove("hidden");
  renderSummary();
  els.tripNameInput.focus();
}

function emptyState(text = "Nothing here yet.") {
  const node = els.emptyTemplate.content.firstElementChild.cloneNode(true);
  node.textContent = text;
  return node;
}

function personName(id) {
  return state.people.find((person) => person.id === id)?.name || "Someone";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function lookupFx(currency, targetCurrency, date) {
  if (currency === targetCurrency) return { from: currency, to: targetCurrency, rate: 1, date, source: "same-currency" };
  if (!useRemoteState) return null;

  const url = new URL("/api/fx", location.origin);
  url.searchParams.set("from", currency);
  url.searchParams.set("to", targetCurrency);
  url.searchParams.set("date", date);
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function ensureExpenseFx(expense, targetCurrency = state.currency) {
  const target = normalizeCurrencyCode(targetCurrency);
  const currency = normalizeCurrencyCode(expense.currency);
  if (currency === target) {
    expense.fx = { from: currency, to: target, rate: 1, date: expense.date, source: "same-currency" };
    return expense;
  }

  if (expense.fx?.from === currency && expense.fx?.to === target && Number(expense.fx.rate) > 0) return expense;
  expense.fx = await lookupFx(currency, target, expense.date);
  return expense;
}

async function refreshAllFx() {
  for (const expense of state.expenses) {
    await ensureExpenseFx(expense);
  }
}

function calculateBalances() {
  return calculateBalancesForState(state);
}

function calculateSettlements(balances) {
  return calculateSettlementsForBalances(balances);
}

function renderPeople() {
  els.payerSelect.replaceChildren();
  els.splitWithList.replaceChildren();
  els.peopleEditor.replaceChildren();

  for (const person of state.people) {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    els.payerSelect.append(option);

    const label = document.createElement("label");
    label.className = "check-pill";
    label.innerHTML = `<input type="checkbox" value="${person.id}" checked /> <span></span>`;
    label.querySelector("span").textContent = person.name;
    els.splitWithList.append(label);

    const editor = document.createElement("label");
    editor.className = "person-editor";
    editor.innerHTML = `<span></span><input value="" data-person-id="${person.id}" />`;
    editor.querySelector("span").textContent = "Name";
    editor.querySelector("input").value = person.name;
    els.peopleEditor.append(editor);
  }

  els.expenseForm.querySelector("button[type='submit']").disabled = state.people.length < 2;
}

function renderBalances() {
  const balances = calculateBalances();
  els.balancesList.replaceChildren();

  if (state.people.length === 0) {
    els.balancesList.append(emptyState("Balances appear after people are added."));
    return balances;
  }

  for (const person of state.people) {
    const balance = balances[person.id] || 0;
    const row = document.createElement("div");
    row.className = "balance-row";
    row.innerHTML = `
      <div class="row-person">
        <div>
          <span class="person-name"></span>
          <span class="row-caption">${balance >= 0 ? "gets back" : "owes"}</span>
        </div>
      </div>
      <strong class="balance-value ${balance >= 0 ? "positive" : "negative"}">${formatMoney(balance, state.currency, { signed: true })}</strong>
    `;
    row.querySelector(".person-name").textContent = person.name;
    row.querySelector(".row-person").prepend(avatarFor(person));
    els.balancesList.append(row);
  }

  return balances;
}

function renderSettlements(balances) {
  const settlements = calculateSettlements(balances);
  els.settlementsList.replaceChildren();

  if (settlements.length === 0) {
    els.settlementsList.append(emptyState(state.expenses.length ? "Everyone is square." : "Add expenses to see payments."));
    return;
  }

  for (const settlement of settlements) {
    const fromPerson = state.people.find((person) => person.id === settlement.from);
    const toPerson = state.people.find((person) => person.id === settlement.to);
    const row = document.createElement("div");
    row.className = "settlement-row";
    row.innerHTML = `
      <span class="settle-arrow">→</span>
      <span class="settle-text"><strong></strong> pays <strong></strong></span>
      <strong class="settlement-amount">${formatMoney(settlement.amount, state.currency)}</strong>
    `;
    const names = row.querySelectorAll(".settle-text strong");
    names[0].textContent = personName(settlement.from);
    names[1].textContent = personName(settlement.to);
    row.prepend(avatarFor(toPerson));
    row.prepend(avatarFor(fromPerson));
    els.settlementsList.append(row);
  }
}

function renderExpenses() {
  els.expenseList.replaceChildren();

  if (state.expenses.length === 0) {
    els.expenseList.append(emptyState("No expenses logged yet."));
    return;
  }

  const sortedExpenses = [...state.expenses].sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    if (byDate !== 0) return byDate;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  const expensesByDate = new Map();
  for (const expense of sortedExpenses) {
    const date = expense.date || "Undated";
    const expenses = expensesByDate.get(date) || [];
    expenses.push(expense);
    expensesByDate.set(date, expenses);
  }

  for (const [date, expenses] of expensesByDate) {
    const isExpanded = expandedLedgerDates.has(date);
    const group = document.createElement("section");
    group.className = `ledger-day${isExpanded ? " expanded" : ""}`;

    const readyAmounts = expenses.map((expense) => convertedAmountMinor(expense, state.currency));
    const pendingCount = readyAmounts.filter((amount) => amount === null).length;
    const dayTotal = readyAmounts.reduce((total, amount) => total + (amount || 0), 0);
    const chargeLabel = `${expenses.length} charge${expenses.length === 1 ? "" : "s"}`;
    const pendingLabel = pendingCount ? ` · ${pendingCount} awaiting FX` : "";
    const panelId = `ledger-day-${date.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;

    group.innerHTML = `
      <button class="ledger-day-toggle" type="button" aria-expanded="${isExpanded}" aria-controls="${panelId}">
        <span class="ledger-day-icon" aria-hidden="true"></span>
        <span class="ledger-day-heading">
          <strong class="ledger-day-date"></strong>
          <span class="ledger-day-meta">${chargeLabel}${pendingLabel}</span>
        </span>
        <strong class="ledger-day-total">${formatMoney(dayTotal, state.currency)}</strong>
      </button>
      <div id="${panelId}" class="ledger-day-expenses${isExpanded ? "" : " hidden"}"></div>
    `;

    group.querySelector(".ledger-day-date").textContent = displayDate(date);
    const panel = group.querySelector(".ledger-day-expenses");
    const toggle = group.querySelector(".ledger-day-toggle");
    toggle.addEventListener("click", () => {
      if (expandedLedgerDates.has(date)) expandedLedgerDates.delete(date);
      else expandedLedgerDates.add(date);
      const expanded = expandedLedgerDates.has(date);
      group.classList.toggle("expanded", expanded);
      toggle.setAttribute("aria-expanded", String(expanded));
      panel.classList.toggle("hidden", !expanded);
    });

    for (const expense of expenses) {
      const row = document.createElement("article");
      row.className = "expense-row";
      const convertedMinor = convertedAmountMinor(expense, state.currency);
      const originalText = formatMoney(expense.amountMinor, expense.currency);
      const convertedText =
        convertedMinor === null
          ? "Awaiting FX rates"
          : expense.currency === state.currency
            ? originalText
            : `${originalText} -> ${formatMoney(convertedMinor, state.currency)}`;
      const fxText = expense.currency === state.currency ? "" : expense.fx ? `FX ${expense.fx.date || expense.date} @ ${Number(expense.fx.rate).toFixed(6)}` : "Awaiting FX rates";
      const isForeign = expense.currency !== state.currency;

      row.innerHTML = `
        <span class="ccy-badge ${isForeign ? "foreign" : ""}"></span>
        <div class="expense-main">
          <div class="expense-title-line">
            <span class="expense-title"></span>
            <span class="status-chip expense-fx-chip"></span>
          </div>
          <div class="expense-meta">
            <span class="expense-payer"></span>
            <span class="expense-split-label"></span>
            <span class="expense-facepile" aria-label="Split participants"></span>
          </div>
          <div class="expense-submeta"></div>
          <div class="row-actions">
            <button class="secondary-button edit-expense" type="button">Edit</button>
            <button class="delete-expense" type="button" title="Delete expense">×</button>
          </div>
        </div>
        <div class="expense-amount">
          <div class="expense-amount-value"></div>
        </div>
      `;
      row.querySelector(".ccy-badge").textContent = currencyFor(expense.currency).symbol;
      row.querySelector(".expense-title").textContent = expense.description;
      row.querySelector(".expense-payer").textContent = `Paid by ${personName(expense.payerId)}`;
      row.querySelector(".expense-split-label").textContent =
        `Split ${expense.splitWith.length} way${expense.splitWith.length === 1 ? "" : "s"}`;
      const facepile = row.querySelector(".expense-facepile");
      facepile.setAttribute("aria-label", `Split between ${expense.splitWith.map(personName).join(", ")}`);
      for (const personId of expense.splitWith.slice(0, 5)) {
        const person = state.people.find((item) => item.id === personId);
        if (!person) continue;
        const avatar = avatarFor(person);
        avatar.classList.add("expense-facepile-avatar");
        avatar.title = person.name;
        avatar.setAttribute("aria-hidden", "true");
        facepile.append(avatar);
      }
      if (expense.splitWith.length > 5) {
        const remainder = document.createElement("span");
        remainder.className = "expense-facepile-more";
        remainder.setAttribute("aria-hidden", "true");
        remainder.textContent = `+${expense.splitWith.length - 5}`;
        facepile.append(remainder);
      }
      row.querySelector(".expense-fx-chip").textContent = convertedText;
      const amountEl = row.querySelector(".expense-amount-value");
      amountEl.textContent = convertedMinor === null ? "—" : formatMoney(convertedMinor, state.currency);
      const submeta = row.querySelector(".expense-submeta");
      submeta.textContent = isForeign ? `${formatMoney(expense.amountMinor, expense.currency)} · ${fxText}` : "";
      submeta.classList.toggle("hidden", !isForeign);
      row.querySelector(".edit-expense").addEventListener("click", () => startEditExpense(expense.id));
      row.querySelector(".delete-expense").addEventListener("click", async () => {
        if (!confirm(`Delete "${expense.description}"?`)) return;
        state.expenses = state.expenses.filter((item) => item.id !== expense.id);
        await saveState();
        render();
      });
      panel.append(row);
    }

    els.expenseList.append(group);
  }
}

function renderSummary() {
  const pending = state.expenses.filter((expense) => expenseStatus(expense, state.currency) === "fx_pending").length;
  els.tripTitle.textContent = state.name || "Trip";
  const peopleCount = state.people.length;
  const expenseCount = state.expenses.length;
  els.statusText.textContent = `${formatMoney(calculateTotalMinor(state), state.currency)} · ${peopleCount} ${peopleCount === 1 ? "person" : "people"} · ${expenseCount} expense${expenseCount === 1 ? "" : "s"}`;
  els.pendingCount.textContent = pending;
  els.summaryGrid.classList.toggle("hidden", pending === 0);
  els.pendingMetric.classList.toggle("hidden", pending === 0);
  els.pendingFxPanel.classList.toggle("hidden", pending === 0);
  els.tripNameInput.value = state.name || "";
  populateCurrencySelect(els.tripCurrencySelect, state.currency);
  if (!editingExpenseId) {
    populateCurrencySelect(els.expenseCurrencySelect, state.currency);
  } else {
    populateCurrencySelect(els.expenseCurrencySelect, els.expenseCurrencySelect.value || state.currency);
  }
}

function renderExpenseForm() {
  els.expenseFormTitle.textContent = editingExpenseId ? "Edit expense" : "Add expense";
  els.saveExpenseButton.textContent = editingExpenseId ? "Save expense" : "Add expense";
  els.cancelEditButton.classList.toggle("hidden", !editingExpenseId);
}

function render() {
  renderSummary();
  renderPeople();
  const balances = renderBalances();
  renderSettlements(balances);
  renderExpenses();
  renderExpenseForm();
}

function resetExpenseForm() {
  editingExpenseId = null;
  els.descriptionInput.value = "";
  els.amountInput.value = "";
  els.expenseCurrencySelect.value = state.currency;
  els.expenseDateInput.value = today();
  render();
  els.descriptionInput.focus();
}

function startEditExpense(expenseId) {
  const expense = state.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  editingExpenseId = expenseId;
  els.descriptionInput.value = expense.description;
  els.amountInput.value = fromMinorUnits(expense.amountMinor, expense.currency).toFixed(currencyFor(expense.currency).fractionDigits);
  els.expenseCurrencySelect.value = expense.currency;
  els.expenseDateInput.value = expense.date || today();
  els.payerSelect.value = expense.payerId;
  for (const input of els.splitWithList.querySelectorAll("input")) {
    input.checked = expense.splitWith.includes(input.value);
  }
  renderExpenseForm();
  els.descriptionInput.focus();
}

async function upsertExpense() {
  const checked = [...els.splitWithList.querySelectorAll("input:checked")].map((input) => input.value);
  const currency = normalizeCurrencyCode(els.expenseCurrencySelect.value);
  const amount = Number(els.amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0 || checked.length === 0) return;

  const existing = state.expenses.find((expense) => expense.id === editingExpenseId);
  const expense = {
    id: existing?.id || uid(),
    description: els.descriptionInput.value.trim() || "Expense",
    amountMinor: toMinorUnits(amount, currency),
    currency,
    payerId: els.payerSelect.value,
    splitWith: checked,
    date: els.expenseDateInput.value || today(),
    fx: null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ensureExpenseFx(expense);

  if (existing) {
    state.expenses = state.expenses.map((item) => (item.id === existing.id ? expense : item));
  } else {
    state.expenses.push(expense);
  }
  expandedLedgerDates.add(expense.date);

  await saveState();
  resetExpenseForm();
}

async function updateSettings() {
  const nextCurrency = normalizeCurrencyCode(els.tripCurrencySelect.value);
  state.name = els.tripNameInput.value.trim() || state.name;
  state.currency = nextCurrency;
  for (const input of els.peopleEditor.querySelectorAll("input[data-person-id]")) {
    const person = state.people.find((item) => item.id === input.dataset.personId);
    if (person && input.value.trim()) person.name = input.value.trim();
  }
  await refreshAllFx();
  await saveState();
  render();
}

function copyButtonFeedback(button, text) {
  const label = button.querySelector(".button-label") || button;
  const original = label.textContent;
  label.textContent = text;
  setTimeout(() => {
    label.textContent = original;
  }, 1200);
}

function balanceLines() {
  const balances = calculateBalances();
  const pending = state.expenses.filter((expense) => expenseStatus(expense, state.currency) === "fx_pending").length;
  return [
    `${state.name} balances`,
    pending ? `Awaiting FX rates: ${pending} expense${pending === 1 ? "" : "s"} excluded from balances` : "",
    ...state.people.map((person) => `${person.name}: ${formatMoney(balances[person.id] || 0, state.currency, { signed: true })}`),
  ].filter(Boolean);
}

function settlementLines() {
  const settlements = calculateSettlements(calculateBalances());
  return [
    `${state.name} settle up`,
    ...(settlements.length
      ? settlements.map((item) => `${personName(item.from)} pays ${personName(item.to)} ${formatMoney(item.amount, state.currency)}`)
      : ["Everyone is square."]),
  ];
}

els.createTripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createTrip(els.createTripName.value, els.createParticipants.value, els.createCurrency.value);
    els.createTripForm.reset();
  } catch (error) {
    alert(error.message || "Trip creation failed");
  }
});

els.openTripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await openTrip(els.openTripInput.value);
    els.openTripInput.value = "";
  } catch (error) {
    alert(error.message || "Trip not found");
    showTripGate();
  }
});

els.switchTripButton.addEventListener("click", showTripGate);

els.openSettingsButton.addEventListener("click", showSettings);

els.backToDashboardButton.addEventListener("click", showDashboard);

els.copyLinkButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(tripUrl());
  copyButtonFeedback(els.copyLinkButton, "Copied");
});

els.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void upsertExpense();
});

els.cancelEditButton.addEventListener("click", resetExpenseForm);

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void updateSettings();
});

els.addParticipantButton.addEventListener("click", async () => {
  const name = els.newParticipantInput.value.trim();
  if (!name) return;
  state.people.push({ id: uid(), name });
  els.newParticipantInput.value = "";
  await saveState();
  render();
});

els.retryFxButton.addEventListener("click", async () => {
  await refreshAllFx();
  await saveState();
  render();
});

els.copyBalancesButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(balanceLines().join("\n"));
  copyButtonFeedback(els.copyBalancesButton, "Copied");
});

els.copySettlementsButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(settlementLines().join("\n"));
  copyButtonFeedback(els.copySettlementsButton, "Copied");
});

els.downloadCsvButton.addEventListener("click", () => {
  const header = [
    "Date",
    "Description",
    "Original amount",
    "Original currency",
    "Converted amount",
    "Trip currency",
    "FX date",
    "FX rate",
    "Paid by",
    "Participants",
  ];
  const rows = state.expenses.map((expense) => {
    const convertedMinor = convertedAmountMinor(expense, state.currency);
    return [
      expense.date || "",
      expense.description,
      fromMinorUnits(expense.amountMinor, expense.currency).toFixed(currencyFor(expense.currency).fractionDigits),
      expense.currency,
      convertedMinor === null ? "Awaiting FX rates" : fromMinorUnits(convertedMinor, state.currency).toFixed(currencyFor(state.currency).fractionDigits),
      state.currency,
      expense.fx?.date || "",
      expense.fx?.rate || "",
      personName(expense.payerId),
      expense.splitWith.map(personName).join("; "),
    ];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`trip-split-ledger-${stamp}.csv`, `${csv}\n`, "text/csv;charset=utf-8");
});

populateCurrencySelect(els.createCurrency, DEFAULT_CURRENCY);
populateCurrencySelect(els.expenseCurrencySelect, DEFAULT_CURRENCY);
populateCurrencySelect(els.tripCurrencySelect, DEFAULT_CURRENCY);
els.expenseDateInput.value = today();

const urlTripId = new URLSearchParams(location.search).get("trip");
const savedTrip = JSON.parse(localStorage.getItem(TRIP_KEY) || "null");
if (urlTripId || savedTrip?.tripId) {
  openTripFromId(urlTripId || savedTrip.tripId).catch(() => showTripGate());
} else {
  showTripGate();
}
