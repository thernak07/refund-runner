/**
 * Mock transaction history, used whenever PayPal sandbox is empty/unconfigured.
 * Dates are generated relative to "now" so the 30-day search window always matches.
 */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getMockTransactions() {
  return [
    { id: "TXN-9001", date: daysAgo(2),  merchant: "StreamFlix Prime", amount: "-18.99", currency: "USD", status: "S", note: "subscription renewal" },
    { id: "TXN-9002", date: daysAgo(3),  merchant: "CookieMart Store", amount: "-49.90", currency: "USD", status: "S", note: "order #1042" },
    { id: "TXN-9003", date: daysAgo(3),  merchant: "CookieMart Store", amount: "-49.90", currency: "USD", status: "S", note: "order #1042 (duplicate charge)" },
    { id: "TXN-9004", date: daysAgo(6),  merchant: "WirePro Gadgets",  amount: "-139.00", currency: "USD", status: "S", note: "Bluetooth headphones — never dispatched" },
    { id: "TXN-9005", date: daysAgo(9),  merchant: "ChefBox Meals",    amount: "-32.50", currency: "USD", status: "S", note: "meal kit, arrived spoiled" },
    { id: "TXN-9006", date: daysAgo(12), merchant: "GymFlex Bundle",   amount: "-89.99", currency: "USD", status: "S", note: "annual renewal contract no longer needed" },
    { id: "TXN-9007", date: daysAgo(15), merchant: "TaxiGo Rides",     amount: "-12.40", currency: "USD", status: "S", note: "driver cancelled, still charged" },
    { id: "TXN-9008", date: daysAgo(19), merchant: "PixelPlay Games",  amount: "-7.99",  currency: "USD", status: "S", note: "in-app purchase — child bought by mistake" },
    { id: "TXN-9009", date: daysAgo(24), merchant: "CafeAroma",        amount: "-9.15",  currency: "USD", status: "S", note: "coffee order" },
    { id: "TXN-9010", date: daysAgo(27), merchant: "BookNest Online",  amount: "-24.99", currency: "USD", status: "S", note: "paperback delivered, 60+ pages missing" },
  ];
}

/**
 * Mock dispute history — list view works like the PayPal Disputes API output.
 */
export function getMockDisputes() {
  return [
    {
      id: "PP-D-9001",
      status: "OPEN",
      subject: "I did not receive the item",
      amount: "139.00 USD",
      opened: daysAgo(6).slice(0, 10),
      source: "paypal-sandbox",
    },
    {
      id: "PP-D-9002",
      status: "RESOLVED",
      subject: "Duplicate charge",
      amount: "49.90 USD",
      opened: daysAgo(30).slice(0, 10),
      source: "paypal-sandbox",
    },
  ];
}
