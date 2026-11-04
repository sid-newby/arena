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

function createPaymentsSpec(data: Record<string, unknown>): Spec {
  const payments = data.payments as
    | {
        data?: Array<{
          id: string;
          formattedAmount: string;
          status: string;
          description: string;
          created: string;
        }>;
        total?: number;
        totalVolume?: string;
        successRate?: string;
        hasMore?: boolean;
      }
    | undefined;

  const paymentsList = payments?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "metrics", "filters", "list", "pagination"],
    },
    heading: {
      type: "Heading",
      props: { text: "Payments", size: "xlarge" },
      children: [],
    },
    metrics: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["volumeMetric", "rateMetric", "countMetric"],
    },
    volumeMetric: {
      type: "Metric",
      props: {
        label: "Total Volume",
        value: payments?.totalVolume ?? "$0",
        changeType: "positive",
      },
      children: [],
    },
    rateMetric: {
      type: "Metric",
      props: {
        label: "Success Rate",
        value: payments?.successRate ?? "0%",
        changeType: "positive",
      },
      children: [],
    },
    countMetric: {
      type: "Metric",
      props: {
        label: "Total Payments",
        value: String(payments?.total ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    filters: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: ["refreshBtn", "exportBtn"],
    },
    refreshBtn: {
      type: "Button",
      props: { label: "Refresh", action: "refreshPayments", type: "secondary" },
      children: [],
    },
    exportBtn: {
      type: "Button",
      props: {
        label: "Export CSV",
        action: "exportData",
        actionParams: { format: "csv", dataType: "payments" },
        type: "secondary",
      },
      children: [],
    },
    list: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: paymentsList.slice(0, 10).map((_, i) => `payment${i}`),
    },
    pagination: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: payments?.hasMore ? ["loadMore"] : [],
    },
    loadMore: {
      type: "Button",
      props: {
        label: "Load More",
        action: "fetchPayments",
        actionParams: {
          limit: 10,
          startingAfter: paymentsList[paymentsList.length - 1]?.id,
        },
        type: "secondary",
      },
      children: [],
    },
  };

  paymentsList.slice(0, 10).forEach((p, i) => {
    elements[`payment${i}`] = {
      type: "PaymentCard",
      props: {
        amount: 0,
        currency: "usd",
        status: p.status as "succeeded" | "pending" | "failed" | "canceled",
        description: `${p.formattedAmount} - ${p.description}`,
        paymentId: p.id,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const Payments = (_props: ExtensionContextValue) => {
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
      await executeAction("fetchPayments", { limit: 10 }, handleSetState, {});
      setLoading(false);
    };
    loadData();
  }, [handleSetState]);

  useEffect(() => {
    if (!loading && Object.keys(data).length > 0) {
      setSpec(createPaymentsSpec(data));
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
      setSpec(createPaymentsSpec(data));
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <ContextView title="Payments" brandColor="#635BFF" brandIcon={BrandIcon}>
        <Box
          css={{
            stack: "y",
            gap: "medium",
            alignX: "center",
            paddingY: "xlarge",
          }}
        >
          <Spinner size="large" />
          <Box css={{ color: "secondary" }}>Loading payments...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Payments"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction(
              "openDashboard",
              { page: "payments" },
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
              placeholder="Describe the payments view you want..."
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

export default Payments;
