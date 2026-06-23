const STORAGE_KEY = "trip-split-state-v1";
const TRIP_KEY = "trip-split-active-trip-v1";

const defaultState = {
  currency: "$",
  people: [],
  expenses: [],
};

let state = structuredClone(defaultState);
let tripId = null;
let tripLabel = "";
const useRemoteState = location.protocol.startsWith("http");

const els = {
  tripGate: document.querySelector("#tripGate"),
  tripApp: document.querySelector("#tripApp"),
  createTripForm: document.querySelector("#createTripForm"),
  createTripPassword: document.querySelector("#createTripPassword"),
  createCurrency: document.querySelector("#createCurrency"),
  createParticipants: document.querySelector("#createParticipants"),
  openTripForm: document.querySelector("#openTripForm"),
  openTripPassword: document.querySelector("#openTripPassword"),
  switchTripButton: document.querySelector("#switchTripButton"),
  tripBadge: document.querySelector("#tripBadge"),
  currencyDisplay: document.querySelector("#currencyDisplay"),
  expenseForm: document.querySelector("#expenseForm"),
  descriptionInput: document.querySelector("#descriptionInput"),
  amountInput: document.querySelector("#amountInput"),
  amountCurrencyLabel: document.querySelector("#amountCurrencyLabel"),
  payerSelect: document.querySelector("#payerSelect"),
  splitWithList: document.querySelector("#splitWithList"),
  balancesList: document.querySelector("#balancesList"),
  settlementsList: document.querySelector("#settlementsList"),
  expenseList: document.querySelector("#expenseList"),
  totalSpent: document.querySelector("#totalSpent"),
  peopleCount: document.querySelector("#peopleCount"),
  expenseCount: document.querySelector("#expenseCount"),
  copySummaryButton: document.querySelector("#copySummaryButton"),
  downloadCsvButton: document.querySelector("#downloadCsvButton"),
  emptyTemplate: document.querySelector("#emptyStateTemplate"),
};

async function hashPassword(password) {
  const data = new TextEncoder().encode(password.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function localStorageKey() {
  return tripId ? `${STORAGE_KEY}:${tripId}` : STORAGE_KEY;
}

async function loadState() {
  if (!tripId) return structuredClone(defaultState);

  if (useRemoteState) {
    try {
      const response = await fetch(`/api/state?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
      if (response.ok) return { ...defaultState, ...(await response.json()) };
    } catch {
      // Fall back to the local copy below when the shared server is unavailable.
    }
  }

  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(localStorageKey())) };
  } catch {
    return structuredClone(defaultState);
  }
}

async function saveState() {
  if (!tripId) return;

  if (useRemoteState) {
    await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...state, tripId }),
    });
  }
  localStorage.setItem(localStorageKey(), JSON.stringify(state));
}

async function openTrip(password) {
  const cleanPassword = password.trim();
  if (!cleanPassword) return;

  tripId = await hashPassword(cleanPassword);
  tripLabel = cleanPassword;
  localStorage.setItem(TRIP_KEY, JSON.stringify({ tripId, tripLabel }));
  state = await loadState();
  if (state.people.length === 0 && state.expenses.length === 0) {
    alert("No trip found for that password. Create it first, then share the password with your group.");
    showTripGate();
    return;
  }
  els.tripGate.classList.add("hidden");
  els.tripApp.classList.remove("hidden");
  render();
}

function parseParticipantNames(value) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

async function createTrip(password, participantText, currency) {
  const cleanPassword = password.trim();
  const names = parseParticipantNames(participantText);
  if (!cleanPassword || names.length === 0) return;

  tripId = await hashPassword(cleanPassword);
  tripLabel = cleanPassword;
  const existingState = await loadState();
  const hasExistingData = existingState.people.length > 0 || existingState.expenses.length > 0;
  if (hasExistingData && !confirm("This trip password already has data. Replace the group and clear expenses?")) {
    showTripGate();
    return;
  }

  state = {
    ...structuredClone(defaultState),
    currency: currency || "$",
    people: names.map((name) => ({ id: uid(), name })),
  };
  localStorage.setItem(TRIP_KEY, JSON.stringify({ tripId, tripLabel }));
  await saveState();
  els.tripGate.classList.add("hidden");
  els.tripApp.classList.remove("hidden");
  render();
}

function showTripGate() {
  tripId = null;
  tripLabel = "";
  state = structuredClone(defaultState);
  localStorage.removeItem(TRIP_KEY);
  els.tripApp.classList.add("hidden");
  els.tripGate.classList.remove("hidden");
  els.openTripPassword.focus();
}

function money(value) {
  const symbol = state.currency || "$";
  return `${symbol}${Math.abs(value).toFixed(2)}`;
}

function signedMoney(value) {
  if (Math.abs(value) < 0.005) return `${state.currency || "$"}0.00`;
  return `${value < 0 ? "-" : "+"}${money(value)}`;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function emptyState(text = "Nothing here yet.") {
  const node = els.emptyTemplate.content.firstElementChild.cloneNode(true);
  node.textContent = text;
  return node;
}

function calculateBalances() {
  const balances = Object.fromEntries(state.people.map((person) => [person.id, 0]));

  for (const expense of state.expenses) {
    if (!balances.hasOwnProperty(expense.payerId) || expense.splitWith.length === 0) continue;
    balances[expense.payerId] += expense.amount;
    const share = expense.amount / expense.splitWith.length;
    for (const personId of expense.splitWith) {
      if (balances.hasOwnProperty(personId)) balances[personId] -= share;
    }
  }

  return balances;
}

function calculateSettlements(balances) {
  const debtors = [];
  const creditors = [];

  for (const [personId, balance] of Object.entries(balances)) {
    if (balance < -0.005) debtors.push({ personId, amount: -balance });
    if (balance > 0.005) creditors.push({ personId, amount: balance });
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

    if (debtor.amount < 0.005) debtorIndex += 1;
    if (creditor.amount < 0.005) creditorIndex += 1;
  }

  return settlements;
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

function renderPeople() {
  els.payerSelect.replaceChildren();
  els.splitWithList.replaceChildren();

  for (const person of state.people) {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    els.payerSelect.append(option);

    const label = document.createElement("label");
    label.className = "check-pill";
    label.innerHTML = `<input type="checkbox" value="${person.id}" checked /> <span>${person.name}</span>`;
    els.splitWithList.append(label);
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
      <span class="person-name">${person.name}</span>
      <strong class="balance-value ${balance >= 0 ? "positive" : "negative"}">${signedMoney(balance)}</strong>
    `;
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
    const row = document.createElement("div");
    row.className = "settlement-row";
    row.innerHTML = `
      <span><strong>${personName(settlement.from)}</strong> pays <strong>${personName(settlement.to)}</strong></span>
      <strong>${money(settlement.amount)}</strong>
    `;
    els.settlementsList.append(row);
  }
}

function renderExpenses() {
  els.expenseList.replaceChildren();

  if (state.expenses.length === 0) {
    els.expenseList.append(emptyState("No expenses logged yet."));
    return;
  }

  for (const expense of [...state.expenses].reverse()) {
    const row = document.createElement("article");
    row.className = "expense-row";
    const splitNames = expense.splitWith.map(personName).join(", ");
    row.innerHTML = `
      <div>
        <div class="expense-title">${expense.description} · ${money(expense.amount)}</div>
        <div class="expense-meta">Paid by ${personName(expense.payerId)} · participated: ${splitNames}</div>
      </div>
    `;

    const button = document.createElement("button");
    button.className = "delete-expense";
    button.type = "button";
    button.title = "Delete expense";
    button.textContent = "×";
    button.addEventListener("click", () => {
      state.expenses = state.expenses.filter((item) => item.id !== expense.id);
      void saveState();
      render();
    });
    row.append(button);
    els.expenseList.append(row);
  }
}

function renderSummary() {
  const total = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  els.tripBadge.textContent = tripLabel ? `Trip: ${tripLabel}` : "";
  els.currencyDisplay.textContent = state.currency || "$";
  els.amountCurrencyLabel.textContent = `(${state.currency || "$"})`;
  els.totalSpent.textContent = money(total);
  els.peopleCount.textContent = state.people.length;
  els.expenseCount.textContent = state.expenses.length;
}

function render() {
  renderSummary();
  renderPeople();
  const balances = renderBalances();
  renderSettlements(balances);
  renderExpenses();
}

els.createTripForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createTrip(els.createTripPassword.value, els.createParticipants.value, els.createCurrency.value);
  els.createTripPassword.value = "";
  els.createParticipants.value = "";
});

els.openTripForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void openTrip(els.openTripPassword.value);
  els.openTripPassword.value = "";
});

els.switchTripButton.addEventListener("click", showTripGate);

els.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const checked = [...els.splitWithList.querySelectorAll("input:checked")].map((input) => input.value);
  const amount = Number(els.amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0 || checked.length === 0) return;

  state.expenses.push({
    id: uid(),
    description: els.descriptionInput.value.trim(),
    amount: Math.round(amount * 100) / 100,
    payerId: els.payerSelect.value,
    splitWith: checked,
    createdAt: new Date().toISOString(),
  });

  els.descriptionInput.value = "";
  els.amountInput.value = "";
  void saveState();
  render();
  els.descriptionInput.focus();
});

els.copySummaryButton.addEventListener("click", async () => {
  const balances = calculateBalances();
  const settlements = calculateSettlements(balances);
  const lines = [
    `Trip Split summary`,
    `Total spent: ${money(state.expenses.reduce((sum, expense) => sum + expense.amount, 0))}`,
    "",
    "Balances:",
    ...state.people.map((person) => `${person.name}: ${signedMoney(balances[person.id] || 0)}`),
    "",
    "Settle up:",
    ...(settlements.length
      ? settlements.map((item) => `${personName(item.from)} pays ${personName(item.to)} ${money(item.amount)}`)
      : ["Everyone is square."]),
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
  els.copySummaryButton.textContent = "Copied";
  setTimeout(() => {
    els.copySummaryButton.textContent = "Copy summary";
  }, 1200);
});

els.downloadCsvButton.addEventListener("click", () => {
  const header = ["Date", "Description", "Amount", "Currency", "Paid by", "Participants"];
  const rows = state.expenses.map((expense) => [
    expense.createdAt || "",
    expense.description,
    expense.amount.toFixed(2),
    state.currency || "$",
    personName(expense.payerId),
    expense.splitWith.map(personName).join("; "),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`trip-split-ledger-${stamp}.csv`, `${csv}\n`, "text/csv;charset=utf-8");
});

const savedTrip = JSON.parse(localStorage.getItem(TRIP_KEY) || "null");
if (savedTrip?.tripId) {
  tripId = savedTrip.tripId;
  tripLabel = savedTrip.tripLabel || "Saved trip";
  loadState().then((loadedState) => {
    if (loadedState.people.length === 0 && loadedState.expenses.length === 0) {
      showTripGate();
      return;
    }
    state = loadedState;
    els.tripGate.classList.add("hidden");
    els.tripApp.classList.remove("hidden");
    render();
  });
} else {
  showTripGate();
}
