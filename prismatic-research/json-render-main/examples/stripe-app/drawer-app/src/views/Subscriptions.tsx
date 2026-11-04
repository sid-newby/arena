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

function createSubscriptionsSpec(data: Record<string, unknown>): Spec {
  const subscriptions = data.subscriptions as
    | {
        data?: Array<{
          id: string;
          planName: string;
          status: string;
          amount: number;
          interval: string;
          currentPeriodEnd: string;
          customerId: string;
        }>;
        total?: number;
        active?: number;
        trialing?: number;
        pastDue?: number;
        canceled?: number;
        hasMore?: boolean;
      }
    | undefined;

  const subscriptionsList = subscriptions?.data ?? [];

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
      props: { text: "Subscriptions", size: "xlarge" },
      children: [],
    },
    metrics: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: [
        "activeMetric",
        "trialingMetric",
        "pastDueMetric",
        "canceledMetric",
      ],
    },
    activeMetric: {
      type: "Metric",
      props: {
        label: "Active",
        value: String(subscriptions?.active ?? 0),
        changeType: "positive",
      },
      children: [],
    },
    trialingMetric: {
      type: "Metric",
      props: {
        label: "Trialing",
        value: String(subscriptions?.trialing ?? 0),
        changeType: "positive",
      },
      children: [],
    },
    pastDueMetric: {
      type: "Metric",
      props: {
        label: "Past Due",
        value: String(subscriptions?.pastDue ?? 0),
        changeType: subscriptions?.pastDue ? "negative" : "neutral",
      },
      children: [],
    },
    canceledMetric: {
      type: "Metric",
      props: {
        label: "Canceled",
        value: String(subscriptions?.canceled ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    alert: {
      type: "Banner",
      props: {
        title: subscriptions?.pastDue
          ? `${subscriptions.pastDue} subscriptions need attention`
          : `${subscriptions?.trialing ?? 0} subscriptions trialing`,
        type: subscriptions?.pastDue ? "caution" : "default",
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
      props: {
        label: "Refresh",
        action: "refreshSubscriptions",
        type: "secondary",
      },
      children: [],
    },
    exportBtn: {
      type: "Button",
      props: {
        label: "Export CSV",
        action: "exportData",
        actionParams: { format: "csv", dataType: "subscriptions" },
        type: "secondary",
      },
      children: [],
    },
    list: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: subscriptionsList
        .slice(0, 10)
        .map((_, i) => `subscription${i}`),
    },
    pagination: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: subscriptions?.hasMore ? ["loadMore"] : [],
    },
    loadMore: {
      type: "Button",
      props: {
        label: "Load More",
        action: "fetchSubscriptions",
        actionParams: { limit: 10 },
        type: "secondary",
      },
      children: [],
    },
  };

  subscriptionsList.slice(0, 10).forEach((s, i) => {
    elements[`subscription${i}`] = {
      type: "SubscriptionCard",
      props: {
        planName: s.planName,
        status: s.status as
          | "active"
          | "trialing"
          | "past_due"
          | "canceled"
          | "unpaid",
        amount: s.amount,
        currency: "usd",
        interval: s.interval as "month" | "year",
        currentPeriodEnd: s.currentPeriodEnd,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const Subscriptions = (_props: ExtensionContextValue) => {
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
      await executeAction(
        "fetchSubscriptions",
        { limit: 10 },
        handleSetState,
        {},
      );
      setLoading(false);
    };
    loadData();
  }, [handleSetState]);

  useEffect(() => {
    if (!loading && Object.keys(data).length > 0) {
      setSpec(createSubscriptionsSpec(data));
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
      setSpec(createSubscriptionsSpec(data));
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <ContextView
        title="Subscriptions"
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
          <Box css={{ color: "secondary" }}>Loading subscriptions...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Subscriptions"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction(
              "openDashboard",
              { page: "subscriptions" },
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
              placeholder="Describe the subscriptions view you want..."
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

export default Subscriptions;
