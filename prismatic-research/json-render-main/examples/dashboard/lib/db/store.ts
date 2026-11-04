/**
 * Database store for the dashboard API using Drizzle ORM
 */

import { eq, ilike, or, desc, asc, max } from "drizzle-orm";
import { db } from "./connection";
import {
  customers,
  invoices,
  expenses,
  accounts,
  transactions,
  widgets,
  type Customer,
  type Invoice,
  type Expense,
  type InvoiceItem,
  type WidgetSpec,
} from "./schema";

// Helper to generate IDs
const generateId = (prefix: string) => `${prefix}-${Date.now()}`;

// Customer methods
export async function getCustomers(filters?: {
  status?: string;
  search?: string;
  limit?: number;
  sort?: "newest" | "oldest";
}) {
  let query = db.select().from(customers);

  if (filters?.status) {
    query = query.where(
      eq(customers.status, filters.status as "active" | "inactive"),
    ) as typeof query;
  }

  if (filters?.search) {
    const searchPattern = `%${filters.search}%`;
    query = query.where(
      or(
        ilike(customers.name, searchPattern),
        ilike(customers.email, searchPattern),
      ),
    ) as typeof query;
  }

  // Default to newest first
  const sortOrder = filters?.sort === "oldest" ? asc : desc;
  query = query.orderBy(sortOrder(customers.createdAt)) as typeof query;

  if (filters?.limit) {
    query = query.limit(filters.limit) as typeof query;
  }

  return query;
}

export async function getCustomer(id: string) {
  const result = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createCustomer(data: {
  name: string;
  email: string;
  phone?: string;
}) {
  const id = generateId("cust");
  const [customer] = await db
    .insert(customers)
    .values({
      id,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      balance: "0",
      status: "active",
    })
    .returning();
  return customer;
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  const [customer] = await db
    .update(customers)
    .set(data)
    .where(eq(customers.id, id))
    .returning();
  return customer || null;
}

export async function deleteCustomer(id: string) {
  const result = await db
    .delete(customers)
    .where(eq(customers.id, id))
    .returning({ id: customers.id });
  return { success: result.length > 0 };
}

// Invoice methods
export async function getInvoices(filters?: {
  status?: string;
  customerId?: string;
}) {
  let query = db.select().from(invoices);

  if (filters?.status) {
    query = query.where(
      eq(invoices.status, filters.status as Invoice["status"]),
    ) as typeof query;
  }

  if (filters?.customerId) {
    query = query.where(
      eq(invoices.customerId, filters.customerId),
    ) as typeof query;
  }

  return query;
}

export async function getInvoice(id: string) {
  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createInvoice(data: {
  customerId: string;
  dueDate: string;
  items?: InvoiceItem[];
}) {
  const customer = await getCustomer(data.customerId);
  if (!customer) return null;

  const items = data.items || [];
  const amount = items.reduce((sum, item) => sum + item.amount, 0);

  const id = generateId("inv");
  const [invoice] = await db
    .insert(invoices)
    .values({
      id,
      customerId: data.customerId,
      customerName: customer.name,
      amount: amount.toString(),
      status: "draft",
      dueDate: new Date(data.dueDate),
      items,
    })
    .returning();
  return invoice;
}

export async function updateInvoice(id: string, data: Partial<Invoice>) {
  const [invoice] = await db
    .update(invoices)
    .set(data)
    .where(eq(invoices.id, id))
    .returning();
  return invoice || null;
}

export async function deleteInvoice(id: string) {
  const result = await db
    .delete(invoices)
    .where(eq(invoices.id, id))
    .returning({ id: invoices.id });
  return result.length > 0;
}

export async function sendInvoice(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status !== "draft")
    return { error: "Only draft invoices can be sent" };
  return updateInvoice(id, { status: "sent" });
}

export async function markInvoicePaid(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "paid") return { error: "Invoice is already paid" };

  // Update customer balance
  const customer = await getCustomer(invoice.customerId);
  if (customer) {
    const newBalance =
      parseFloat(customer.balance as string) -
      parseFloat(invoice.amount as string);
    await updateCustomer(invoice.customerId, {
      balance: newBalance.toString(),
    });
  }

  // Add transaction
  await db.insert(transactions).values({
    id: generateId("txn"),
    accountId: "acc-001",
    type: "income",
    amount: invoice.amount,
    description: `Invoice #${invoice.id} payment from ${invoice.customerName}`,
    category: "Sales",
    date: new Date(),
  });

  return updateInvoice(id, { status: "paid" });
}

// Expense methods
export async function getExpenses(filters?: {
  status?: string;
  category?: string;
}) {
  let query = db.select().from(expenses);

  if (filters?.status) {
    query = query.where(
      eq(expenses.status, filters.status as Expense["status"]),
    ) as typeof query;
  }

  if (filters?.category) {
    query = query.where(
      eq(expenses.category, filters.category),
    ) as typeof query;
  }

  return query;
}

export async function getExpense(id: string) {
  const result = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createExpense(data: {
  vendor: string;
  category: string;
  amount: number;
  date?: string;
  description?: string;
}) {
  const id = generateId("exp");
  const [expense] = await db
    .insert(expenses)
    .values({
      id,
      vendor: data.vendor,
      category: data.category,
      amount: data.amount.toString(),
      date: data.date ? new Date(data.date) : new Date(),
      status: "pending",
      description: data.description || null,
    })
    .returning();
  return expense;
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  const [expense] = await db
    .update(expenses)
    .set(data)
    .where(eq(expenses.id, id))
    .returning();
  return expense || null;
}

export async function deleteExpense(id: string) {
  const result = await db
    .delete(expenses)
    .where(eq(expenses.id, id))
    .returning({ id: expenses.id });
  return result.length > 0;
}

export async function approveExpense(id: string) {
  const expense = await getExpense(id);
  if (!expense) return { error: "Expense not found" };
  if (expense.status !== "pending")
    return { error: "Only pending expenses can be approved" };

  // Add transaction
  await db.insert(transactions).values({
    id: generateId("txn"),
    accountId: "acc-001",
    type: "expense",
    amount: expense.amount,
    description: `${expense.vendor} - ${expense.description || ""}`,
    category: expense.category,
    date: expense.date,
  });

  return updateExpense(id, { status: "approved" });
}

export async function rejectExpense(id: string) {
  const expense = await getExpense(id);
  if (!expense) return { error: "Expense not found" };
  if (expense.status !== "pending")
    return { error: "Only pending expenses can be rejected" };
  return updateExpense(id, { status: "rejected" });
}

// Account methods
export async function getAccounts() {
  const accountList = await db.select().from(accounts);

  // Get recent transactions for each account
  const result = await Promise.all(
    accountList.map(async (account) => {
      const recentTxns = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, account.id))
        .orderBy(desc(transactions.date))
        .limit(5);
      return { ...account, recentTransactions: recentTxns };
    }),
  );

  return result;
}

export async function getAccount(id: string) {
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);

  if (!result[0]) return null;

  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .orderBy(desc(transactions.date));

  return { ...result[0], transactions: txns };
}

// Dashboard summary
export async function getDashboardSummary() {
  // Get all invoices
  const allInvoices = await db.select().from(invoices);
  const paidInvoices = allInvoices.filter((i) => i.status === "paid");
  const totalRevenue = paidInvoices.reduce(
    (sum, i) => sum + parseFloat(i.amount as string),
    0,
  );

  const outstandingInvoices = allInvoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + parseFloat(i.amount as string), 0);

  const overdueAmount = allInvoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + parseFloat(i.amount as string), 0);

  // Get all expenses
  const allExpenses = await db.select().from(expenses);
  const approvedExpenses = allExpenses.filter((e) => e.status === "approved");
  const totalExpenses = approvedExpenses.reduce(
    (sum, e) => sum + parseFloat(e.amount as string),
    0,
  );

  const cashFlow = totalRevenue - totalExpenses;

  // Get accounts
  const allAccounts = await db.select().from(accounts);
  const totalBankBalance = allAccounts
    .filter((a) => a.type === "bank")
    .reduce((sum, a) => sum + parseFloat(a.balance as string), 0);

  // Get customers
  const allCustomers = await db.select().from(customers);

  // Get recent transactions
  const recentTxns = await db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.date))
    .limit(5);

  // Group expenses by category
  const expensesByCategory = approvedExpenses.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount as string);
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    revenue: {
      total: totalRevenue,
      outstanding: outstandingInvoices,
      overdue: overdueAmount,
    },
    expenses: {
      total: totalExpenses,
      pending: allExpenses.filter((e) => e.status === "pending").length,
    },
    cashFlow,
    bankBalance: totalBankBalance,
    customers: {
      total: allCustomers.length,
      active: allCustomers.filter((c) => c.status === "active").length,
    },
    invoices: {
      total: allInvoices.length,
      draft: allInvoices.filter((i) => i.status === "draft").length,
      sent: allInvoices.filter((i) => i.status === "sent").length,
      paid: allInvoices.filter((i) => i.status === "paid").length,
      overdue: allInvoices.filter((i) => i.status === "overdue").length,
    },
    recentTransactions: recentTxns.map((t) => ({
      ...t,
      amount: parseFloat(t.amount as string),
    })),
    expensesByCategory: Object.entries(expensesByCategory).map(
      ([label, value]) => ({
        label,
        value,
      }),
    ),
    revenueByMonth: [
      { label: "Oct", value: 18000 },
      { label: "Nov", value: 22000 },
      { label: "Dec", value: 28000 },
      { label: "Jan", value: 35000 },
      { label: "Feb", value: totalRevenue },
    ],
  };
}

// Reports
export async function getProfitLossReport(
  startDate?: string,
  endDate?: string,
) {
  const start = startDate ? new Date(startDate) : new Date("2024-01-01");
  const end = endDate ? new Date(endDate) : new Date("2024-12-31");

  const allInvoices = await db.select().from(invoices);
  const paidInvoices = allInvoices.filter(
    (i) => i.status === "paid" && i.createdAt >= start && i.createdAt <= end,
  );

  const allExpenses = await db.select().from(expenses);
  const approvedExpenses = allExpenses.filter(
    (e) => e.status === "approved" && e.date >= start && e.date <= end,
  );

  const totalIncome = paidInvoices.reduce(
    (sum, i) => sum + parseFloat(i.amount as string),
    0,
  );
  const totalExpensesAmount = approvedExpenses.reduce(
    (sum, e) => sum + parseFloat(e.amount as string),
    0,
  );
  const netProfit = totalIncome - totalExpensesAmount;

  const expensesByCategory = approvedExpenses.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + parseFloat(e.amount as string);
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    period: {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    },
    income: {
      total: totalIncome,
      invoiceCount: paidInvoices.length,
    },
    expenses: {
      total: totalExpensesAmount,
      expenseCount: approvedExpenses.length,
      byCategory: Object.entries(expensesByCategory).map(
        ([category, amount]) => ({
          category,
          amount,
        }),
      ),
    },
    netProfit,
    profitMargin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
  };
}

// Clear database (delete all data)
export async function clearDatabase() {
  await db.delete(transactions);
  await db.delete(invoices);
  await db.delete(expenses);
  await db.delete(customers);
  await db.delete(accounts);
  return { message: "Database cleared successfully" };
}

// Reset/seed database
export async function resetDatabase() {
  // Delete all data
  await clearDatabase();

  // Seed accounts first
  await db.insert(accounts).values([
    {
      id: "acc-001",
      name: "Business Checking",
      type: "bank",
      balance: "125000",
      lastSync: new Date(),
    },
    {
      id: "acc-002",
      name: "Business Savings",
      type: "bank",
      balance: "75000",
      lastSync: new Date(),
    },
    {
      id: "acc-003",
      name: "Corporate Card",
      type: "credit_card",
      balance: "-8500",
      lastSync: new Date(),
    },
    {
      id: "acc-004",
      name: "Petty Cash",
      type: "cash",
      balance: "500",
      lastSync: new Date(),
    },
  ]);

  // Seed customers with dates spread over past 30 days
  const now = new Date();
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const seedCustomers = [
    // Enterprise customers (older)
    {
      id: "cust-001",
      name: "Acme Corporation",
      email: "billing@acme.com",
      phone: "(555) 123-4567",
      balance: "15000",
      status: "active" as const,
      createdAt: daysAgo(28),
    },
    {
      id: "cust-002",
      name: "Globex Industries",
      email: "ap@globex.com",
      phone: "(555) 234-5678",
      balance: "8500",
      status: "active" as const,
      createdAt: daysAgo(27),
    },
    {
      id: "cust-003",
      name: "Initech LLC",
      email: "finance@initech.com",
      phone: "(555) 345-6789",
      balance: "2300",
      status: "active" as const,
      createdAt: daysAgo(25),
    },
    {
      id: "cust-004",
      name: "Umbrella Corp",
      email: "accounts@umbrella.com",
      phone: "(555) 456-7890",
      balance: "45000",
      status: "active" as const,
      createdAt: daysAgo(24),
    },
    {
      id: "cust-005",
      name: "Stark Industries",
      email: "billing@stark.com",
      phone: "(555) 567-8901",
      balance: "0",
      status: "inactive" as const,
      createdAt: daysAgo(23),
    },
    // Week 3 signups
    {
      id: "cust-006",
      name: "Wayne Enterprises",
      email: "finance@wayne.com",
      phone: "(555) 678-9012",
      balance: "32000",
      status: "active" as const,
      createdAt: daysAgo(21),
    },
    {
      id: "cust-007",
      name: "Oscorp",
      email: "billing@oscorp.com",
      phone: "(555) 789-0123",
      balance: "12500",
      status: "active" as const,
      createdAt: daysAgo(20),
    },
    {
      id: "cust-008",
      name: "LexCorp",
      email: "accounts@lexcorp.com",
      phone: "(555) 890-1234",
      balance: "67000",
      status: "active" as const,
      createdAt: daysAgo(19),
    },
    {
      id: "cust-009",
      name: "Cyberdyne Systems",
      email: "ap@cyberdyne.com",
      phone: "(555) 901-2345",
      balance: "4500",
      status: "active" as const,
      createdAt: daysAgo(18),
    },
    {
      id: "cust-010",
      name: "Weyland-Yutani",
      email: "billing@weyland.com",
      phone: "(555) 012-3456",
      balance: "89000",
      status: "active" as const,
      createdAt: daysAgo(17),
    },
    // Week 2 signups (more activity)
    {
      id: "cust-011",
      name: "Tyrell Corp",
      email: "finance@tyrell.com",
      phone: "(555) 111-2222",
      balance: "23000",
      status: "active" as const,
      createdAt: daysAgo(14),
    },
    {
      id: "cust-012",
      name: "Soylent Corp",
      email: "billing@soylent.com",
      phone: "(555) 222-3333",
      balance: "5600",
      status: "active" as const,
      createdAt: daysAgo(14),
    },
    {
      id: "cust-013",
      name: "Massive Dynamic",
      email: "accounts@massive.com",
      phone: "(555) 333-4444",
      balance: "41000",
      status: "active" as const,
      createdAt: daysAgo(13),
    },
    {
      id: "cust-014",
      name: "Aperture Science",
      email: "billing@aperture.com",
      phone: "(555) 444-5555",
      balance: "0",
      status: "inactive" as const,
      createdAt: daysAgo(12),
    },
    {
      id: "cust-015",
      name: "Black Mesa",
      email: "finance@blackmesa.com",
      phone: "(555) 555-6666",
      balance: "18500",
      status: "active" as const,
      createdAt: daysAgo(11),
    },
    {
      id: "cust-016",
      name: "Vault-Tec",
      email: "sales@vaulttec.com",
      phone: "(555) 666-7777",
      balance: "72000",
      status: "active" as const,
      createdAt: daysAgo(10),
    },
    {
      id: "cust-017",
      name: "Abstergo Industries",
      email: "billing@abstergo.com",
      phone: "(555) 777-8888",
      balance: "9800",
      status: "active" as const,
      createdAt: daysAgo(10),
    },
    {
      id: "cust-018",
      name: "Shinra Electric",
      email: "accounts@shinra.com",
      phone: "(555) 888-9999",
      balance: "125000",
      status: "active" as const,
      createdAt: daysAgo(9),
    },
    // Week 1 signups (high activity)
    {
      id: "cust-019",
      name: "Monsters Inc",
      email: "billing@monsters.com",
      phone: "(555) 999-0000",
      balance: "34500",
      status: "active" as const,
      createdAt: daysAgo(7),
    },
    {
      id: "cust-020",
      name: "Buy n Large",
      email: "finance@bnl.com",
      phone: "(555) 000-1111",
      balance: "56000",
      status: "active" as const,
      createdAt: daysAgo(7),
    },
    {
      id: "cust-021",
      name: "Omni Consumer",
      email: "ap@omni.com",
      phone: "(555) 121-2121",
      balance: "8900",
      status: "active" as const,
      createdAt: daysAgo(6),
    },
    {
      id: "cust-022",
      name: "Rekall Inc",
      email: "billing@rekall.com",
      phone: "(555) 131-3131",
      balance: "15600",
      status: "active" as const,
      createdAt: daysAgo(5),
    },
    {
      id: "cust-023",
      name: "Virtucon",
      email: "accounts@virtucon.com",
      phone: "(555) 141-4141",
      balance: "28000",
      status: "active" as const,
      createdAt: daysAgo(5),
    },
    {
      id: "cust-024",
      name: "Wonka Industries",
      email: "finance@wonka.com",
      phone: "(555) 151-5151",
      balance: "47000",
      status: "active" as const,
      createdAt: daysAgo(4),
    },
    {
      id: "cust-025",
      name: "Dunder Mifflin",
      email: "sales@dundermifflin.com",
      phone: "(555) 161-6161",
      balance: "3200",
      status: "active" as const,
      createdAt: daysAgo(4),
    },
    {
      id: "cust-026",
      name: "Sterling Cooper",
      email: "billing@sterlingcooper.com",
      phone: "(555) 171-7171",
      balance: "19500",
      status: "active" as const,
      createdAt: daysAgo(3),
    },
    // Recent signups (last few days)
    {
      id: "cust-027",
      name: "Prestige Worldwide",
      email: "boats@prestige.com",
      phone: "(555) 181-8181",
      balance: "0",
      status: "active" as const,
      createdAt: daysAgo(2),
    },
    {
      id: "cust-028",
      name: "Pied Piper",
      email: "richard@piedpiper.com",
      phone: "(555) 191-9191",
      balance: "500",
      status: "active" as const,
      createdAt: daysAgo(2),
    },
    {
      id: "cust-029",
      name: "Hooli",
      email: "billing@hooli.com",
      phone: "(555) 202-0202",
      balance: "250000",
      status: "active" as const,
      createdAt: daysAgo(1),
    },
    {
      id: "cust-030",
      name: "Aviato",
      email: "erlich@aviato.com",
      phone: "(555) 212-1212",
      balance: "1200",
      status: "active" as const,
      createdAt: daysAgo(1),
    },
    {
      id: "cust-031",
      name: "Bluth Company",
      email: "gob@bluth.com",
      phone: "(555) 222-2222",
      balance: "0",
      status: "inactive" as const,
      createdAt: daysAgo(0),
    },
    {
      id: "cust-032",
      name: "Los Pollos Hermanos",
      email: "gus@lospollos.com",
      phone: "(555) 232-3232",
      balance: "98000",
      status: "active" as const,
      createdAt: daysAgo(0),
    },
  ];

  await db.insert(customers).values(seedCustomers);

  // Seed invoices
  await db.insert(invoices).values([
    {
      id: "inv-001",
      customerId: "cust-001",
      customerName: "Acme Corporation",
      amount: "5000",
      status: "paid",
      dueDate: new Date("2024-02-15"),
      items: [
        {
          description: "Consulting Services",
          quantity: 20,
          rate: 250,
          amount: 5000,
        },
      ],
    },
    {
      id: "inv-002",
      customerId: "cust-002",
      customerName: "Globex Industries",
      amount: "3500",
      status: "sent",
      dueDate: new Date("2024-02-28"),
      items: [
        {
          description: "Software License",
          quantity: 7,
          rate: 500,
          amount: 3500,
        },
      ],
    },
    {
      id: "inv-003",
      customerId: "cust-001",
      customerName: "Acme Corporation",
      amount: "10000",
      status: "overdue",
      dueDate: new Date("2024-01-31"),
      items: [
        {
          description: "Annual Support Contract",
          quantity: 1,
          rate: 10000,
          amount: 10000,
        },
      ],
    },
    {
      id: "inv-004",
      customerId: "cust-003",
      customerName: "Initech LLC",
      amount: "2300",
      status: "draft",
      dueDate: new Date("2024-03-15"),
      items: [
        {
          description: "Training Session",
          quantity: 1,
          rate: 2300,
          amount: 2300,
        },
      ],
    },
    {
      id: "inv-005",
      customerId: "cust-004",
      customerName: "Umbrella Corp",
      amount: "45000",
      status: "sent",
      dueDate: new Date("2024-03-01"),
      items: [
        {
          description: "Enterprise License",
          quantity: 1,
          rate: 45000,
          amount: 45000,
        },
      ],
    },
  ]);

  // Seed expenses
  await db.insert(expenses).values([
    {
      id: "exp-001",
      vendor: "AWS",
      category: "Software",
      amount: "2500",
      date: new Date("2024-02-01"),
      status: "approved",
      description: "Cloud hosting - February",
    },
    {
      id: "exp-002",
      vendor: "Office Depot",
      category: "Office Supplies",
      amount: "350",
      date: new Date("2024-02-05"),
      status: "approved",
      description: "Printer paper and toner",
    },
    {
      id: "exp-003",
      vendor: "Delta Airlines",
      category: "Travel",
      amount: "890",
      date: new Date("2024-02-10"),
      status: "pending",
      description: "Flight to client meeting",
    },
    {
      id: "exp-004",
      vendor: "WeWork",
      category: "Rent",
      amount: "4500",
      date: new Date("2024-02-01"),
      status: "approved",
      description: "Office space - February",
    },
    {
      id: "exp-005",
      vendor: "Uber",
      category: "Travel",
      amount: "125",
      date: new Date("2024-02-12"),
      status: "pending",
      description: "Client site visits",
    },
  ]);

  // Seed transactions
  await db.insert(transactions).values([
    {
      id: "txn-001",
      accountId: "acc-001",
      type: "income",
      amount: "5000",
      description: "Invoice #inv-001 payment",
      category: "Sales",
      date: new Date("2024-02-10"),
    },
    {
      id: "txn-002",
      accountId: "acc-001",
      type: "expense",
      amount: "2500",
      description: "AWS hosting",
      category: "Software",
      date: new Date("2024-02-01"),
    },
    {
      id: "txn-003",
      accountId: "acc-003",
      type: "expense",
      amount: "350",
      description: "Office supplies",
      category: "Office",
      date: new Date("2024-02-05"),
    },
    {
      id: "txn-004",
      accountId: "acc-001",
      type: "income",
      amount: "15000",
      description: "Consulting retainer",
      category: "Sales",
      date: new Date("2024-02-01"),
    },
    {
      id: "txn-005",
      accountId: "acc-001",
      type: "expense",
      amount: "4500",
      description: "Office rent",
      category: "Rent",
      date: new Date("2024-02-01"),
    },
  ]);

  return { message: "Database reset and seeded successfully" };
}

// Widget methods
export async function getWidgets() {
  return db.select().from(widgets).orderBy(asc(widgets.order));
}

export async function getWidget(id: string) {
  const result = await db
    .select()
    .from(widgets)
    .where(eq(widgets.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createWidget(data: { prompt: string; spec: WidgetSpec }) {
  const id = generateId("widget");

  // Get the next order value
  const [result] = await db
    .select({ maxOrder: max(widgets.order) })
    .from(widgets);
  const nextOrder = (result?.maxOrder ?? -1) + 1;

  const [widget] = await db
    .insert(widgets)
    .values({
      id,
      prompt: data.prompt,
      spec: data.spec,
      order: nextOrder,
    })
    .returning();
  return widget;
}

export async function updateWidget(
  id: string,
  data: { prompt?: string; spec?: WidgetSpec },
) {
  const [widget] = await db
    .update(widgets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(widgets.id, id))
    .returning();
  return widget || null;
}

export async function deleteWidget(id: string) {
  const result = await db
    .delete(widgets)
    .where(eq(widgets.id, id))
    .returning({ id: widgets.id });
  return result.length > 0;
}

export async function reorderWidgets(orderedIds: string[]) {
  // Update each widget's order based on position in array
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (!id) continue;
    await db.update(widgets).set({ order: i }).where(eq(widgets.id, id));
  }
}
