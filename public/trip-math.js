export function calculateBalances(state) {
  const people = Array.isArray(state?.people) ? state.people : [];
  const expenses = Array.isArray(state?.expenses) ? state.expenses : [];
  const balances = Object.fromEntries(people.map((person) => [person.id, 0]));

  for (const expense of expenses) {
    if (!Object.prototype.hasOwnProperty.call(balances, expense.payerId) || expense.splitWith.length === 0) continue;
    balances[expense.payerId] += expense.amount;
    const share = expense.amount / expense.splitWith.length;
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
