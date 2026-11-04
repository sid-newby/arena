import { useState, useCallback, useEffect } from "react";
import type { Spec } from "@json-render/react";
import {
  Banner,
  Box,
  ContextView,
  Divider,
  Button,
  Link,
  TextField,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  List,
  ListItem,
  Spinner,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";

import BrandIcon from "./brand_icon.svg";
import { stripeCatalog, StripeRenderer } from "../lib/render";
import { executeAction } from "../lib/render/catalog/actions";
import { API_GENERATE_URL } from "../lib/config";
import { streamSpec } from "../lib/stream-spec";

// =============================================================================
// Dynamic Specs (use real data from context)
// =============================================================================

function createRevenueSpec(data: Record<string, unknown>): Spec {
  const customers = data.customers as { total?: number } | undefined;
  const payments = data.payments as
    | { totalVolume?: string; successRate?: string }
    | undefined;
  const subscriptions = data.subscriptions as
    | { active?: number; trialing?: number; pastDue?: number }
    | undefined;

  return {
    root: "root",
    elements: {
      root: {
        type: "Stack",
        props: { direction: "vertical", gap: "large" },
        children: ["heading", "metrics", "refresh"],
      },
      heading: {
        type: "Heading",
        props: { text: "Revenue Dashboard", size: "xlarge" },
        children: [],
      },
      metrics: {
        type: "Stack",
        props: { direction: "horizontal", gap: "medium" },
        children: ["m1", "m2", "m3"],
      },
      m1: {
        type: "Metric",
        props: {
          label: "Payment Volume",
          value: payments?.totalVolume ?? "$0",
          change: payments?.successRate
            ? `${payments.successRate} success`
            : null,
          changeType: "positive",
        },
        children: [],
      },
      m2: {
        type: "Metric",
        props: {
          label: "Active Subscriptions",
          value: String(subscriptions?.active ?? 0),
          change: subscriptions?.trialing
            ? `+${subscriptions.trialing} trialing`
            : null,
          changeType: "positive",
        },
        children: [],
      },
      m3: {
        type: "Metric",
        props: {
          label: "Total Customers",
          value: String(customers?.total ?? 0),
          changeType: "neutral",
        },
        children: [],
      },
      refresh: {
        type: "Button",
        props: {
          label: "Refresh Data",
          action: "refreshData",
          type: "secondary",
        },
        children: [],
      },
    },
  };
}

function createPaymentsSpec(data: Record<string, unknown>): Spec {
  const payments = data.payments as
    | {
        data?: Array<{
          id: string;
          formattedAmount: string;
          status: string;
          description: string;
        }>;
        totalVolume?: string;
        successRate?: string;
      }
    | undefined;
  const paymentsList = payments?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "stats", "payments", "refresh"],
    },
    heading: {
      type: "Heading",
      props: { text: "Recent Payments", size: "xlarge" },
      children: [],
    },
    stats: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["s1", "s2"],
    },
    s1: {
      type: "Metric",
      props: {
        label: "Total Volume",
        value: payments?.totalVolume ?? "$0",
        changeType: "positive",
      },
      children: [],
    },
    s2: {
      type: "Metric",
      props: {
        label: "Success Rate",
        value: payments?.successRate ?? "0%",
        changeType: "positive",
      },
      children: [],
    },
    payments: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: paymentsList.slice(0, 5).map((_, i) => `p${i}`),
    },
    refresh: {
      type: "Button",
      props: {
        label: "Refresh Payments",
        action: "fetchPayments",
        type: "secondary",
      },
      children: [],
    },
  };

  paymentsList.slice(0, 5).forEach((p, i) => {
    elements[`p${i}`] = {
      type: "PaymentCard",
      props: {
        amount: 0, // We'll use formattedAmount in description
        currency: "usd",
        status: p.status as "succeeded" | "pending" | "failed",
        description: `${p.formattedAmount} - ${p.description}`,
        paymentId: p.id,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

function createSubscriptionsSpec(data: Record<string, unknown>): Spec {
  const subscriptions = data.subscriptions as
    | {
        data?: Array<{
          id: string;
          planName: string;
          status: string;
          amount: number;
          interval: string;
        }>;
        active?: number;
        trialing?: number;
        pastDue?: number;
      }
    | undefined;
  const subsList = subscriptions?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "metrics", "alert", "subs", "refresh"],
    },
    heading: {
      type: "Heading",
      props: { text: "Subscriptions Overview", size: "xlarge" },
      children: [],
    },
    metrics: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["m1", "m2", "m3"],
    },
    m1: {
      type: "Metric",
      props: {
        label: "Active",
        value: String(subscriptions?.active ?? 0),
        changeType: "positive",
      },
      children: [],
    },
    m2: {
      type: "Metric",
      props: {
        label: "Trialing",
        value: String(subscriptions?.trialing ?? 0),
        changeType: "positive",
      },
      children: [],
    },
    m3: {
      type: "Metric",
      props: {
        label: "Past Due",
        value: String(subscriptions?.pastDue ?? 0),
        changeType: subscriptions?.pastDue ? "negative" : "neutral",
      },
      children: [],
    },
    alert: {
      type: "Banner",
      props: {
        title: `${subscriptions?.trialing ?? 0} subscriptions currently trialing`,
        type: "default",
      },
      children: [],
    },
    subs: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: subsList.slice(0, 5).map((_, i) => `sub${i}`),
    },
    refresh: {
      type: "Button",
      props: {
        label: "Refresh Subscriptions",
        action: "fetchSubscriptions",
        type: "secondary",
      },
      children: [],
    },
  };

  subsList.slice(0, 5).forEach((s, i) => {
    elements[`sub${i}`] = {
      type: "SubscriptionCard",
      props: {
        planName: s.planName,
        status: s.status as "active" | "trialing" | "past_due" | "canceled",
        amount: s.amount,
        interval: (s.interval as "month" | "year") ?? "month",
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

function createCustomersSpec(data: Record<string, unknown>): Spec {
  const customers = data.customers as
    | {
        data?: Array<{
          id: string;
          name: string;
          email: string;
          status: string;
        }>;
        total?: number;
      }
    | undefined;
  const customersList = customers?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "stats", "customers", "refresh"],
    },
    heading: {
      type: "Heading",
      props: { text: "Customer Directory", size: "xlarge" },
      children: [],
    },
    stats: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["s1"],
    },
    s1: {
      type: "Metric",
      props: {
        label: "Total Customers",
        value: String(customers?.total ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    customers: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: customersList.slice(0, 5).map((_, i) => `c${i}`),
    },
    refresh: {
      type: "Button",
      props: {
        label: "Refresh Customers",
        action: "fetchCustomers",
        type: "secondary",
      },
      children: [],
    },
  };

  customersList.slice(0, 5).forEach((c, i) => {
    elements[`c${i}`] = {
      type: "CustomerCard",
      props: {
        name: c.name,
        email: c.email,
        status: c.status as "active" | "inactive",
        customerId: c.id,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

function createInvoicesSpec(data: Record<string, unknown>): Spec {
  const invoices = data.invoices as
    | {
        data?: Array<{
          id: string;
          invoiceNumber: string;
          amount: number;
          status: string;
          dueDate: string | null;
        }>;
        outstanding?: string;
        paid?: string;
        overdue?: string;
      }
    | undefined;
  const invoicesList = invoices?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "stats", "invoices", "refresh"],
    },
    heading: {
      type: "Heading",
      props: { text: "Invoice Management", size: "xlarge" },
      children: [],
    },
    stats: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["s1", "s2", "s3"],
    },
    s1: {
      type: "Metric",
      props: {
        label: "Outstanding",
        value: invoices?.outstanding ?? "$0",
        changeType: "neutral",
      },
      children: [],
    },
    s2: {
      type: "Metric",
      props: {
        label: "Paid",
        value: invoices?.paid ?? "$0",
        changeType: "positive",
      },
      children: [],
    },
    s3: {
      type: "Metric",
      props: {
        label: "Overdue",
        value: invoices?.overdue ?? "$0",
        changeType: invoices?.overdue !== "$0.00" ? "negative" : "neutral",
      },
      children: [],
    },
    invoices: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: invoicesList.slice(0, 5).map((_, i) => `inv${i}`),
    },
    refresh: {
      type: "Button",
      props: {
        label: "Refresh Invoices",
        action: "fetchInvoices",
        type: "secondary",
      },
      children: [],
    },
  };

  invoicesList.slice(0, 5).forEach((inv, i) => {
    elements[`inv${i}`] = {
      type: "InvoiceCard",
      props: {
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        status: inv.status as "draft" | "open" | "paid" | "void",
        dueDate: inv.dueDate,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Catalog Info for Display
// =============================================================================

const componentCatalogInfo = Object.entries(stripeCatalog.data.components).map(
  ([name, def]) => ({
    name,
    description: def.description,
  }),
);

const actionsCatalogInfo = Object.entries(stripeCatalog.data.actions).map(
  ([name, def]) => ({
    name,
    description: def.description,
  }),
);

// =============================================================================
// Home Component
// =============================================================================

const Home = (_props: ExtensionContextValue) => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSpec, setCurrentSpec] = useState<Spec | null>(null);
  const [data, setState] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  const handleSetState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => updater(prev));
    },
    [],
  );

  // Load initial data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        await executeAction("refreshData", {}, handleSetState, {});
      } catch (err) {
        console.error("Failed to load data:", err);
        setError("Failed to load Stripe data");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [handleSetState]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const dataSnapshot = JSON.stringify(data, null, 2);

      await streamSpec(
        API_GENERATE_URL,
        {
          prompt: `${prompt}\n\nAVAILABLE STRIPE DATA (use this real data, do NOT invent fake numbers):\n${dataSnapshot}`,
          systemPrompt: stripeCatalog.prompt({
            system:
              "You are a Stripe dashboard widget builder. Generate UI specs for displaying Stripe data.",
            customRules: [
              'LAYOUT CONSTRAINT: This UI renders inside a narrow Stripe dashboard drawer (~320px wide). NEVER place more than 2 small items side-by-side horizontally. Prefer vertical (stacked) layouts. Use direction:"horizontal" sparingly and only for very compact items like a label+value pair.',
              'DATA: The user prompt includes real Stripe data under "AVAILABLE STRIPE DATA". You MUST use these real values when setting /state. NEVER invent or hallucinate numbers. If the data you need is not available, say so in a Text element rather than making up data. The data keys are: customers (data[], total), payments (data[], total, totalVolume, successRate), subscriptions (data[], total, active, trialing, pastDue, canceled), invoices (data[], total, totalAmount, paid, open, overdue).',
            ],
          }),
        },
        (spec) => setCurrentSpec(spec),
      );
    } catch (err) {
      // Use dynamic specs with real data as fallback
      const lowerPrompt = prompt.toLowerCase();

      if (
        lowerPrompt.includes("payment") ||
        lowerPrompt.includes("transaction")
      ) {
        setCurrentSpec(createPaymentsSpec(data));
      } else if (
        lowerPrompt.includes("subscription") ||
        lowerPrompt.includes("recurring")
      ) {
        setCurrentSpec(createSubscriptionsSpec(data));
      } else if (
        lowerPrompt.includes("customer") ||
        lowerPrompt.includes("user")
      ) {
        setCurrentSpec(createCustomersSpec(data));
      } else if (
        lowerPrompt.includes("invoice") ||
        lowerPrompt.includes("billing")
      ) {
        setCurrentSpec(createInvoicesSpec(data));
      } else {
        setCurrentSpec(createRevenueSpec(data));
      }

      setError(
        `Using local generation (${err instanceof Error ? err.message : "API unavailable"})`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ContextView
      title="json-render Demo"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      externalLink={{
        label: "json-render docs",
        href: "https://github.com/vercel-labs/json-render",
      }}
    >
      {isLoading ? (
        <Box
          css={{
            stack: "y",
            gap: "medium",
            alignX: "center",
            paddingY: "xlarge",
          }}
        >
          <Spinner size="large" />
          <Box css={{ font: "body", color: "secondary" }}>
            Loading Stripe data...
          </Box>
        </Box>
      ) : (
        <Tabs fitted>
          <TabList>
            <Tab id="generate">Generate</Tab>
            <Tab id="components">Components</Tab>
            <Tab id="actions">Actions</Tab>
          </TabList>
          <TabPanels>
            {/* Generate Tab */}
            <TabPanel id="generate">
              <Box css={{ stack: "y", gap: "medium", paddingY: "medium" }}>
                <TextField
                  label="Describe the dashboard you want"
                  placeholder="e.g., Show MRR, payments, or subscriptions"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <Button
                  type="primary"
                  onPress={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                >
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>

                {error && (
                  <Box css={{ color: "secondary", font: "caption" }}>
                    {error}
                  </Box>
                )}

                {currentSpec && (
                  <>
                    <Divider />
                    <StripeRenderer
                      spec={currentSpec}
                      data={data}
                      setData={handleSetState}
                      loading={isGenerating}
                    />
                  </>
                )}

                {(
                  data._actionResult as
                    | { message?: string; url?: string }
                    | undefined
                )?.message && (
                  <Banner
                    title={(data._actionResult as { message: string }).message}
                    description={
                      (data._actionResult as { url?: string }).url
                        ? "Open in Stripe Dashboard"
                        : undefined
                    }
                    actions={
                      (data._actionResult as { url?: string }).url ? (
                        <Link
                          href={(data._actionResult as { url: string }).url}
                          external
                        >
                          Open
                        </Link>
                      ) : undefined
                    }
                    onDismiss={() =>
                      setState((prev) => {
                        const next = { ...prev };
                        delete next._actionResult;
                        return next;
                      })
                    }
                  />
                )}

                <Divider />
                <Box css={{ font: "caption", color: "secondary" }}>
                  Try: &quot;Show revenue metrics&quot; &bull; &quot;Show recent
                  payments&quot; &bull; &quot;Show subscriptions&quot; &bull;
                  &quot;Show customers&quot; &bull; &quot;Show invoices&quot;
                </Box>
              </Box>
            </TabPanel>

            {/* Components Catalog Tab */}
            <TabPanel id="components">
              <Box css={{ paddingY: "medium" }}>
                <Box css={{ font: "subheading", marginBottom: "medium" }}>
                  Available Components ({componentCatalogInfo.length})
                </Box>
                <List>
                  {componentCatalogInfo.map((comp) => (
                    <ListItem
                      key={comp.name}
                      title={comp.name}
                      secondaryTitle={comp.description}
                    />
                  ))}
                </List>
              </Box>
            </TabPanel>

            {/* Actions Catalog Tab */}
            <TabPanel id="actions">
              <Box css={{ paddingY: "medium" }}>
                <Box css={{ font: "subheading", marginBottom: "medium" }}>
                  Available Actions ({actionsCatalogInfo.length})
                </Box>
                <List>
                  {actionsCatalogInfo.map((action) => (
                    <ListItem
                      key={action.name}
                      title={action.name}
                      secondaryTitle={action.description}
                    />
                  ))}
                </List>
              </Box>
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </ContextView>
  );
};

export default Home;
