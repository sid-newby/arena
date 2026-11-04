import {
  pgTable,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

// Enums
export const customerStatusEnum = pgEnum("customer_status", [
  "active",
  "inactive",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
]);

export const expenseStatusEnum = pgEnum("expense_status", [
  "pending",
  "approved",
  "rejected",
]);

export const accountTypeEnum = pgEnum("account_type", [
  "bank",
  "credit_card",
  "cash",
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

// Tables
export const customers = pgTable("customers", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  balance: decimal("balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  status: customerStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id", { length: 50 }).primaryKey(),
  customerId: varchar("customer_id", { length: 50 })
    .notNull()
    .references(() => customers.id),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  dueDate: timestamp("due_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  items: jsonb("items").$type<InvoiceItem[]>().notNull().default([]),
});

export const expenses = pgTable("expenses", {
  id: varchar("id", { length: 50 }).primaryKey(),
  vendor: varchar("vendor", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  status: expenseStatusEnum("status").notNull().default("pending"),
  description: text("description"),
});

export const accounts = pgTable("accounts", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: accountTypeEnum("type").notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).notNull(),
  lastSync: timestamp("last_sync").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 50 }).primaryKey(),
  accountId: varchar("account_id", { length: 50 })
    .notNull()
    .references(() => accounts.id),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  date: timestamp("date").notNull(),
});

export const widgets = pgTable("widgets", {
  id: varchar("id", { length: 50 }).primaryKey(),
  prompt: text("prompt").notNull(),
  spec: jsonb("spec").$type<WidgetSpec>().notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Types
export interface WidgetSpec {
  root: string;
  elements: Record<string, unknown>;
}
export interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

export type Widget = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
