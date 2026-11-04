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

function createCustomersListSpec(data: Record<string, unknown>): Spec {
  const customers = data.customers as
    | {
        data?: Array<{
          id: string;
          name: string;
          email: string;
          status: string;
          created: string;
        }>;
        total?: number;
        hasMore?: boolean;
      }
    | undefined;

  const customerList = customers?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "stats", "actions", "list", "pagination"],
    },
    heading: {
      type: "Heading",
      props: { text: "Customer Directory", size: "xlarge" },
      children: [],
    },
    stats: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["totalMetric"],
    },
    totalMetric: {
      type: "Metric",
      props: {
        label: "Total Customers",
        value: String(customers?.total ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    actions: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: ["refreshBtn", "exportBtn"],
    },
    refreshBtn: {
      type: "Button",
      props: {
        label: "Refresh",
        action: "refreshCustomers",
        type: "secondary",
      },
      children: [],
    },
    exportBtn: {
      type: "Button",
      props: {
        label: "Export CSV",
        action: "exportData",
        actionParams: { format: "csv", dataType: "customers" },
        type: "secondary",
      },
      children: [],
    },
    list: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: customerList.slice(0, 10).map((_, i) => `customer${i}`),
    },
    pagination: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: customers?.hasMore ? ["loadMore"] : [],
    },
    loadMore: {
      type: "Button",
      props: {
        label: "Load More",
        action: "fetchCustomers",
        actionParams: {
          limit: 10,
          startingAfter: customerList[customerList.length - 1]?.id,
        },
        type: "secondary",
      },
      children: [],
    },
  };

  customerList.slice(0, 10).forEach((c, i) => {
    elements[`customer${i}`] = {
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

// =============================================================================
// Component
// =============================================================================

const Customers = (_props: ExtensionContextValue) => {
  const [data, setState] = useState<Record<string, unknown>>({});
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Wrap setState for action handlers
  const handleSetState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => {
        const next = updater(prev);
        return next;
      });
    },
    [],
  );

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await executeAction("fetchCustomers", { limit: 10 }, handleSetState, {});
      setLoading(false);
    };
    loadData();
  }, [handleSetState]);

  // Update spec when data changes
  useEffect(() => {
    if (!loading && Object.keys(data).length > 0) {
      setSpec(createCustomersListSpec(data));
    }
  }, [data, loading]);

  // Generate custom UI
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);

    // Use catalog prompt for system context
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
      // Fallback to data-driven spec
      setSpec(createCustomersListSpec(data));
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <ContextView
        title="Customer Directory"
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
          <Box css={{ color: "secondary" }}>Loading customers...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Customer Directory"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction(
              "openDashboard",
              { page: "customers" },
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

export default Customers;
