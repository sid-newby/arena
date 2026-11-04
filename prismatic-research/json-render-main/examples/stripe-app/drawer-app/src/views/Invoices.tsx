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

function createInvoicesSpec(data: Record<string, unknown>): Spec {
  const invoices = data.invoices as
    | {
        data?: Array<{
          id: string;
          invoiceNumber: string;
          amount: number;
          status: string;
          dueDate: string;
          customerEmail: string;
          formattedAmount: string;
        }>;
        total?: number;
        outstanding?: string;
        paid?: string;
        overdue?: string;
        hasMore?: boolean;
      }
    | undefined;

  const invoicesList = invoices?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: [
        "heading",
        "metrics",
        "alert",
        "filters",
        "list",
        "pagination",
      ],
    },
    heading: {
      type: "Heading",
      props: { text: "Invoices", size: "xlarge" },
      children: [],
    },
    metrics: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["outstandingMetric", "paidMetric", "overdueMetric"],
    },
    outstandingMetric: {
      type: "Metric",
      props: {
        label: "Outstanding",
        value: invoices?.outstanding ?? "$0",
        changeType: "neutral",
      },
      children: [],
    },
    paidMetric: {
      type: "Metric",
      props: {
        label: "Paid",
        value: invoices?.paid ?? "$0",
        changeType: "positive",
      },
      children: [],
    },
    overdueMetric: {
      type: "Metric",
      props: {
        label: "Overdue",
        value: invoices?.overdue ?? "$0",
        changeType: invoices?.overdue !== "$0.00" ? "negative" : "neutral",
      },
      children: [],
    },
    alert: {
      type: "Banner",
      props: {
        title:
          invoices?.overdue !== "$0.00"
            ? `You have ${invoices?.overdue} in overdue invoices`
            : "All invoices are up to date",
        type: invoices?.overdue !== "$0.00" ? "caution" : "default",
      },
      children: [],
    },
    filters: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: ["refreshBtn", "createBtn", "exportBtn"],
    },
    refreshBtn: {
      type: "Button",
      props: { label: "Refresh", action: "refreshInvoices", type: "secondary" },
      children: [],
    },
    createBtn: {
      type: "Button",
      props: {
        label: "Create Invoice",
        action: "openDashboard",
        actionParams: { page: "invoices" },
        type: "primary",
      },
      children: [],
    },
    exportBtn: {
      type: "Button",
      props: {
        label: "Export CSV",
        action: "exportData",
        actionParams: { format: "csv", dataType: "invoices" },
        type: "secondary",
      },
      children: [],
    },
    list: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: invoicesList.slice(0, 10).map((_, i) => `invoice${i}`),
    },
    pagination: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: invoices?.hasMore ? ["loadMore"] : [],
    },
    loadMore: {
      type: "Button",
      props: {
        label: "Load More",
        action: "fetchInvoices",
        actionParams: { limit: 10 },
        type: "secondary",
      },
      children: [],
    },
  };

  invoicesList.slice(0, 10).forEach((inv, i) => {
    elements[`invoice${i}`] = {
      type: "InvoiceCard",
      props: {
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        currency: "usd",
        status: inv.status as
          | "draft"
          | "open"
          | "paid"
          | "void"
          | "uncollectible",
        dueDate: inv.dueDate,
        customerEmail: inv.customerEmail,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const Invoices = (_props: ExtensionContextValue) => {
  const [data, setState] = useState<Record<string, unknown>>({});
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleSetState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => updater(prev));
    },
    [],
  );

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await executeAction("fetchInvoices", { limit: 10 }, handleSetState, {});
      setLoading(false);
    };
    loadData();
  }, [handleSetState]);

  useEffect(() => {
    if (!loading && Object.keys(data).length > 0) {
      setSpec(createInvoicesSpec(data));
    }
  }, [data, loading]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);

    const systemPrompt = stripeCatalog.prompt();

    try {
      const response = await fetch(API_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemPrompt }),
      });

      const result = await response.json();
      if (result.spec) {
        setSpec(result.spec);
      }
    } catch (error) {
      console.error("Generation error:", error);
      setSpec(createInvoicesSpec(data));
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <ContextView title="Invoices" brandColor="#635BFF" brandIcon={BrandIcon}>
        <Box
          css={{
            stack: "y",
            gap: "medium",
            alignX: "center",
            paddingY: "xlarge",
          }}
        >
          <Spinner size="large" />
          <Box css={{ color: "secondary" }}>Loading invoices...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Invoices"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction(
              "openDashboard",
              { page: "invoices" },
              handleSetState,
              data,
            )
          }
        >
          Open in Dashboard
        </Button>
      }
    >
      <Box css={{ stack: "y", gap: "medium" }}>
        <Box css={{ stack: "x", gap: "small" }}>
          <Box css={{ width: "fill" }}>
            <TextField
              label=""
              placeholder="Describe the invoices view you want..."
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

export default Invoices;
