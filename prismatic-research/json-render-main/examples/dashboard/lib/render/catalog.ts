import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * Dashboard Catalog
 *
 * Components map directly to shadcn/ui components.
 * Actions correspond to real API endpoints in /api/v1/*
 */
export const dashboardCatalog = defineCatalog(schema, {
  components: {
    // Layout
    Stack: {
      props: z.object({
        direction: z.enum(["horizontal", "vertical"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      slots: ["default"],
      description: "Flex layout container",
      example: { direction: "vertical", gap: "md" },
    },

    Accordion: {
      props: z.object({
        type: z.enum(["single", "multiple"]).nullable(),
      }),
      slots: ["default"],
      description: "Collapsible accordion container",
    },

    AccordionItem: {
      props: z.object({
        value: z.string(),
        title: z.string(),
      }),
      slots: ["default"],
      description: "Accordion item with trigger and content",
    },

    // Form
    Button: {
      props: z.object({
        label: z.string(),
        variant: z
          .enum(["default", "secondary", "destructive", "outline", "ghost"])
          .nullable(),
        action: z.string(),
        actionParams: z.record(z.string(), z.unknown()).nullable(),
        disabled: z.boolean().nullable(),
      }),
      description:
        "Clickable button. Use actionParams to pass parameters to the action (e.g., { limit: 5, sort: 'newest' })",
      example: { label: "Save", variant: "default", action: "formSubmit" },
    },

    Input: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        type: z.enum(["text", "email", "password", "number", "tel"]).nullable(),
      }),
      description:
        "Text input field. Use value with $bindState for two-way binding",
      example: {
        label: "Email",
        value: { $bindState: "/form/email" },
        placeholder: "you@example.com",
        type: "email",
      },
    },

    Form: {
      props: z.object({
        submitAction: z.string(),
        submitActionParams: z.record(z.string(), z.unknown()).nullable(),
      }),
      slots: ["default"],
      description:
        "Form container that enables Enter key submission. Wrap form inputs (Input, Select, Checkbox, etc.) and a submit Button inside this component.",
    },

    // Display
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z
          .enum(["default", "secondary", "destructive", "outline"])
          .nullable(),
      }),
      description: "Status badge",
      example: { text: "Active", variant: "default" },
    },

    Alert: {
      props: z.object({
        variant: z.enum(["default", "destructive"]).nullable(),
        title: z.string(),
        description: z.string().nullable(),
      }),
      description: "Alert message",
    },

    Separator: {
      props: z.object({}),
      description: "Visual divider",
    },

    Avatar: {
      props: z.object({
        src: z.string().nullable(),
        alt: z.string().nullable(),
        fallback: z.string(),
      }),
      description: "User avatar image with fallback initials",
    },

    Checkbox: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
        defaultChecked: z.boolean().nullable(),
      }),
      description:
        "Checkbox input. Use checked with $bindState for two-way binding",
    },

    Dialog: {
      props: z.object({
        trigger: z.string(),
        title: z.string(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description: "Modal dialog with trigger button",
    },

    Drawer: {
      props: z.object({
        trigger: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        side: z.enum(["top", "bottom", "left", "right"]).nullable(),
      }),
      slots: ["default"],
      description: "Slide-out drawer panel",
    },

    DropdownMenu: {
      props: z.object({
        trigger: z.string(),
        items: z.array(
          z.object({
            label: z.string(),
            action: z.string().nullable(),
            actionParams: z.record(z.string(), z.unknown()).nullable(),
          }),
        ),
      }),
      description: "Dropdown menu with action items",
    },

    Label: {
      props: z.object({
        text: z.string(),
        htmlFor: z.string().nullable(),
      }),
      description: "Form label",
    },

    Pagination: {
      props: z.object({
        currentPage: z.number(),
        totalPages: z.number(),
        onPageChange: z.string().nullable(),
      }),
      description: "Page navigation",
    },

    Popover: {
      props: z.object({
        trigger: z.string(),
      }),
      slots: ["default"],
      description: "Popover with trigger",
    },

    Progress: {
      props: z.object({
        value: z.number(),
        max: z.number().nullable(),
      }),
      description: "Progress bar",
    },

    RadioGroup: {
      props: z.object({
        value: z.string().nullable(),
        options: z.array(
          z.object({
            value: z.string(),
            label: z.string(),
          }),
        ),
        defaultValue: z.string().nullable(),
      }),
      description:
        "Radio button group. Use value with $bindState for two-way binding",
    },

    Select: {
      props: z.object({
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        options: z.array(
          z.object({
            value: z.string(),
            label: z.string(),
          }),
        ),
      }),
      description:
        "Dropdown select input. Use value with $bindState for two-way binding",
    },

    Skeleton: {
      props: z.object({
        width: z.string().nullable(),
        height: z.string().nullable(),
      }),
      description: "Loading placeholder",
    },

    Spinner: {
      props: z.object({
        size: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      description: "Loading spinner",
    },

    Switch: {
      props: z.object({
        label: z.string().nullable(),
        checked: z.boolean().nullable(),
        defaultChecked: z.boolean().nullable(),
      }),
      description:
        "Toggle switch. Use checked with $bindState for two-way binding",
    },

    Tabs: {
      props: z.object({
        defaultValue: z.string().nullable(),
        tabs: z.array(
          z.object({
            value: z.string(),
            label: z.string(),
          }),
        ),
      }),
      slots: ["default"],
      description: "Tabbed content container",
    },

    TabContent: {
      props: z.object({
        value: z.string(),
      }),
      slots: ["default"],
      description: "Content for a specific tab",
    },

    Textarea: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        rows: z.number().nullable(),
      }),
      description:
        "Multi-line text input. Use value with $bindState for two-way binding",
    },

    Tooltip: {
      props: z.object({
        content: z.string(),
      }),
      slots: ["default"],
      description: "Tooltip on hover",
    },

    Table: {
      props: z.object({
        data: z.array(z.record(z.string(), z.unknown())),
        columns: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
          }),
        ),
        rowActions: z
          .array(
            z.object({
              label: z.string(),
              action: z.string(),
              variant: z
                .enum([
                  "default",
                  "secondary",
                  "destructive",
                  "outline",
                  "ghost",
                ])
                .nullable(),
            }),
          )
          .nullable(),
        emptyMessage: z.string().nullable(),
      }),
      description:
        "Data table with optional row actions. Use { $state } on data to bind to an array of objects.",
      example: {
        data: { $state: "/customers/data" },
        columns: [
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
        ],
      },
    },

    // Typography
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h1", "h2", "h3", "h4"]).nullable(),
      }),
      description: "Section heading",
      example: { text: "Dashboard", level: "h1" },
    },

    Text: {
      props: z.object({
        content: z.string(),
        muted: z.boolean().nullable(),
      }),
      description: "Text content",
      example: { content: "Welcome back! Here is your overview." },
    },

    // Charts
    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKey: z.string(),
        aggregate: z.enum(["sum", "count", "avg"]).nullable(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Bar chart visualization. Use { $state } on data to point to array of objects, xKey is the category/group field, yKey is the numeric value field. Use aggregate='count' to count items grouped by xKey (yKey becomes the count). For dates, xKey values are auto-formatted.",
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        data: z.array(z.record(z.string(), z.unknown())),
        xKey: z.string(),
        yKey: z.string(),
        aggregate: z.enum(["sum", "count", "avg"]).nullable(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Line chart visualization. Use { $state } on data to point to array of objects, xKey is the x-axis field, yKey is the numeric value field. Use aggregate='count' to count items grouped by xKey. For dates, xKey values are auto-formatted.",
    },
  },

  actions: {
    // Customers - use these for customer-related widgets
    viewCustomers: {
      params: z.object({
        status: z.enum(["active", "inactive"]).nullable(),
        limit: z.number().nullable(),
        sort: z.enum(["newest", "oldest"]).nullable(),
      }),
      description:
        "Fetch customers from GET /api/v1/customers. Supports ?limit=N&sort=newest|oldest. Data available at 'customers.data'",
    },
    refreshCustomers: {
      params: z.object({
        limit: z.number().nullable(),
        sort: z.enum(["newest", "oldest"]).nullable(),
      }),
      description:
        "Refresh customers from GET /api/v1/customers. Supports ?limit=N&sort=newest|oldest. Data available at 'customers.data'",
    },
    createCustomer: {
      params: z.object({
        name: z.string(),
        email: z.string(),
        phone: z.string().nullable(),
      }),
      description: "Create new customer via POST /api/v1/customers",
    },
    deleteCustomer: {
      params: z.object({
        customerId: z.string(),
      }),
      description: "Delete a customer via DELETE /api/v1/customers/:id",
    },

    // Invoices - use these for invoice-related widgets
    viewInvoices: {
      params: z.object({
        status: z.enum(["draft", "sent", "paid", "overdue"]).nullable(),
      }),
      description:
        "Fetch invoices from GET /api/v1/invoices. Data available at 'invoices.data'",
    },
    refreshInvoices: {
      params: z.object({}),
      description:
        "Refresh invoices from GET /api/v1/invoices. Data available at 'invoices.data'",
    },
    createInvoice: {
      params: z.object({
        customerId: z.string(),
        dueDate: z.string(),
      }),
      description: "Create new invoice via POST /api/v1/invoices",
    },
    sendInvoice: {
      params: z.object({
        invoiceId: z.string(),
      }),
      description: "Send invoice to customer",
    },
    markInvoicePaid: {
      params: z.object({
        invoiceId: z.string(),
      }),
      description: "Mark invoice as paid",
    },

    // Expenses - use these for expense-related widgets
    viewExpenses: {
      params: z.object({
        status: z.enum(["pending", "approved", "rejected"]).nullable(),
      }),
      description:
        "Fetch expenses from GET /api/v1/expenses. Data available at 'expenses.data'",
    },
    refreshExpenses: {
      params: z.object({}),
      description:
        "Refresh expenses from GET /api/v1/expenses. Data available at 'expenses.data'",
    },
    createExpense: {
      params: z.object({
        vendor: z.string(),
        category: z.string(),
        amount: z.number(),
        description: z.string().nullable(),
      }),
      description: "Create new expense via POST /api/v1/expenses",
    },
    approveExpense: {
      params: z.object({
        expenseId: z.string(),
      }),
      description: "Approve expense",
    },
  },
});
