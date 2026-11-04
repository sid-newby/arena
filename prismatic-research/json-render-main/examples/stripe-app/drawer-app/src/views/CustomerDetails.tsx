import { useState, useEffect, useCallback } from "react";
import type { Spec } from "@json-render/react";
import {
  Box,
  ContextView,
  Button,
  TextField,
  Spinner,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";

import BrandIcon from "./brand_icon.svg";
import { API_GENERATE_URL } from "../lib/config";
import { stripeCatalog, StripeRenderer } from "../lib/render";
import { executeAction } from "../lib/render/catalog/actions";

// =============================================================================
// Dynamic Spec Creation
// =============================================================================

function createCustomerDetailSpec(
  data: Record<string, unknown>,
  customerId: string,
): Spec {
  const customers = data.customers as
    | {
        data?: Array<{
          id: string;
          name: string;
          email: string;
          phone?: string;
          status: string;
          created: string;
          balance?: number;
          currency?: string;
        }>;
      }
    | undefined;

  const customer = customers?.data?.find((c) => c.id === customerId);

  const payments = data.customerPayments as
    | {
        data?: Array<{
          id: string;
          formattedAmount: string;
          status: string;
          description: string;
          created: string;
        }>;
        total?: number;
      }
    | undefined;

  const subscriptions = data.customerSubscriptions as
    | {
        data?: Array<{
          id: string;
          planName: string;
          status: string;
          amount: number;
          interval: string;
          currentPeriodEnd: string;
        }>;
        total?: number;
      }
    | undefined;

  const invoices = data.customerInvoices as
    | {
        data?: Array<{
          id: string;
          invoiceNumber: string;
          amount: number;
          status: string;
          dueDate: string;
        }>;
        total?: number;
      }
    | undefined;

  const paymentsList = payments?.data ?? [];
  const subscriptionsList = subscriptions?.data ?? [];
  const invoicesList = invoices?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["header", "details", "sections"],
    },
    header: {
      type: "Stack",
      props: {
        direction: "horizontal",
        gap: "medium",
        distribute: "space-between",
      },
      children: ["customerInfo", "actions"],
    },
    customerInfo: {
      type: "Stack",
      props: { direction: "vertical", gap: "xsmall" },
      children: ["customerName", "customerEmail"],
    },
    customerName: {
      type: "Heading",
      props: { text: customer?.name ?? "Unknown Customer", size: "xlarge" },
      children: [],
    },
    customerEmail: {
      type: "Text",
      props: { content: customer?.email ?? "", color: "secondary" },
      children: [],
    },
    actions: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: ["editBtn", "portalBtn"],
    },
    editBtn: {
      type: "Button",
      props: {
        label: "Edit",
        action: "viewCustomer",
        actionParams: { customerId },
        type: "secondary",
      },
      children: [],
    },
    portalBtn: {
      type: "Button",
      props: {
        label: "Billing Portal",
        action: "createBillingPortalSession",
        actionParams: { customerId, returnUrl: window.location.href },
        type: "primary",
      },
      children: [],
    },
    details: {
      type: "PropertyList",
      props: { orientation: "horizontal" },
      children: ["detailStatus", "detailCreated", "detailBalance"],
    },
    detailStatus: {
      type: "PropertyListItem",
      props: { label: "Status", value: customer?.status ?? "Unknown" },
      children: [],
    },
    detailCreated: {
      type: "PropertyListItem",
      props: { label: "Created", value: customer?.created ?? "Unknown" },
      children: [],
    },
    detailBalance: {
      type: "PropertyListItem",
      props: {
        label: "Balance",
        value: customer?.balance
          ? `$${(customer.balance / 100).toFixed(2)}`
          : "$0.00",
      },
      children: [],
    },
    sections: {
      type: "Accordion",
      props: {},
      children: ["paymentsSection", "subscriptionsSection", "invoicesSection"],
    },

    // Payments Section
    paymentsSection: {
      type: "AccordionItem",
      props: { title: `Payments (${payments?.total ?? 0})`, defaultOpen: true },
      children: paymentsList.length > 0 ? ["paymentsList"] : ["noPayments"],
    },
    paymentsList: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: paymentsList.slice(0, 5).map((_, i) => `payment${i}`),
    },
    noPayments: {
      type: "Text",
      props: { content: "No payments found", color: "secondary" },
      children: [],
    },

    // Subscriptions Section
    subscriptionsSection: {
      type: "AccordionItem",
      props: {
        title: `Subscriptions (${subscriptions?.total ?? 0})`,
        defaultOpen: false,
      },
      children:
        subscriptionsList.length > 0
          ? ["subscriptionsList"]
          : ["noSubscriptions"],
    },
    subscriptionsList: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: subscriptionsList.slice(0, 5).map((_, i) => `subscription${i}`),
    },
    noSubscriptions: {
      type: "Text",
      props: { content: "No subscriptions found", color: "secondary" },
      children: [],
    },

    // Invoices Section
    invoicesSection: {
      type: "AccordionItem",
      props: {
        title: `Invoices (${invoices?.total ?? 0})`,
        defaultOpen: false,
      },
      children: invoicesList.length > 0 ? ["invoicesList"] : ["noInvoices"],
    },
    invoicesList: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: invoicesList.slice(0, 5).map((_, i) => `invoice${i}`),
    },
    noInvoices: {
      type: "Text",
      props: { content: "No invoices found", color: "secondary" },
      children: [],
    },
  };

  // Add payment cards
  paymentsList.slice(0, 5).forEach((p, i) => {
    elements[`payment${i}`] = {
      type: "PaymentCard",
      props: {
        amount: 0,
        currency: "usd",
        status: p.status as "succeeded" | "pending" | "failed",
        description: `${p.formattedAmount} - ${p.description}`,
        paymentId: p.id,
      },
      children: [],
    };
  });

  // Add subscription cards
  subscriptionsList.slice(0, 5).forEach((s, i) => {
    elements[`subscription${i}`] = {
      type: "SubscriptionCard",
      props: {
        planName: s.planName,
        status: s.status as "active" | "trialing" | "past_due" | "canceled",
        amount: s.amount,
        currency: "usd",
        interval: s.interval as "month" | "year",
        currentPeriodEnd: s.currentPeriodEnd,
      },
      children: [],
    };
  });

  // Add invoice cards
  invoicesList.slice(0, 5).forEach((inv, i) => {
    elements[`invoice${i}`] = {
      type: "InvoiceCard",
      props: {
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        currency: "usd",
        status: inv.status as "draft" | "open" | "paid" | "void",
        dueDate: inv.dueDate,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const CustomerDetails = ({ environment }: ExtensionContextValue) => {
  const [data, setState] = useState<Record<string, unknown>>({});
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Get customer ID from context
  const customerId = environment?.objectContext?.id ?? "";

  // Wrap setState for action handlers
  const handleSetState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => updater(prev));
    },
    [],
  );

  // Load customer data
  useEffect(() => {
    const loadData = async () => {
      if (!customerId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Fetch customer and related data
      await Promise.all([
        executeAction(
          "fetchCustomers",
          { email: null, limit: 100 },
          handleSetState,
          {},
        ),
        executeAction(
          "fetchPayments",
          { customerId, limit: 10 },
          (updater) => {
            setState((prev) => {
              const next = updater(prev);
              return { ...prev, customerPayments: next.payments };
            });
          },
          {},
        ),
        executeAction(
          "fetchSubscriptions",
          { customerId, limit: 10 },
          (updater) => {
            setState((prev) => {
              const next = updater(prev);
              return { ...prev, customerSubscriptions: next.subscriptions };
            });
          },
          {},
        ),
        executeAction(
          "fetchInvoices",
          { customerId, limit: 10 },
          (updater) => {
            setState((prev) => {
              const next = updater(prev);
              return { ...prev, customerInvoices: next.invoices };
            });
          },
          {},
        ),
      ]);

      setLoading(false);
    };
    loadData();
  }, [customerId, handleSetState]);

  // Update spec when data changes
  useEffect(() => {
    if (!loading && customerId) {
      setSpec(createCustomerDetailSpec(data, customerId));
    }
  }, [data, loading, customerId]);

  // Generate custom UI
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);

    const systemPrompt = stripeCatalog.prompt();

    try {
      const response = await fetch(API_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `For customer ${customerId}: ${prompt}`,
          systemPrompt,
        }),
      });

      const result = await response.json();
      if (result.spec) {
        setSpec(result.spec);
      }
    } catch (error) {
      console.error("Generation error:", error);
      setSpec(createCustomerDetailSpec(data, customerId));
    }

    setGenerating(false);
  };

  if (!customerId) {
    return (
      <ContextView
        title="Customer Details"
        brandColor="#635BFF"
        brandIcon={BrandIcon}
      >
        <Box css={{ color: "secondary", padding: "large" }}>
          No customer selected. Please select a customer from the list.
        </Box>
      </ContextView>
    );
  }

  if (loading) {
    return (
      <ContextView
        title="Customer Details"
        brandColor="#635BFF"
        brandIcon={BrandIcon}
      >
        <Box
          css={{
            stack: "y",
            gap: "medium",
            alignX: "center",
            paddingY: "xlarge",
          }}
        >
          <Spinner size="large" />
          <Box css={{ color: "secondary" }}>Loading customer details...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Customer Details"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction("viewCustomer", { customerId }, handleSetState, data)
          }
        >
          View in Dashboard
        </Button>
      }
    >
      <Box css={{ stack: "y", gap: "medium" }}>
        {/* AI Generation Input */}
        <Box css={{ stack: "x", gap: "small" }}>
          <Box css={{ width: "fill" }}>
            <TextField
              label=""
              placeholder="Describe the customer view you want..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Box>
          <Box css={{ alignSelfY: "center" }}>
            <Button
              type="primary"
              onPress={handleGenerate}
              disabled={generating || !prompt.trim()}
            >
              {generating ? "Generating..." : "Generate"}
            </Button>
          </Box>
        </Box>

        {/* Rendered Spec */}
        {spec && (
          <StripeRenderer
            spec={spec}
            data={data}
            setData={handleSetState}
            loading={generating}
          />
        )}
      </Box>
    </ContextView>
  );
};

export default CustomerDetails;
