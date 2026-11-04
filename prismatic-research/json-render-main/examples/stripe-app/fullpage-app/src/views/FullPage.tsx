import { useState, useCallback, useEffect } from "react";
import type { Spec } from "@json-render/react";
import {
  Box,
  FullPageView,
  FullPageTabs,
  FullPageTab,
  Button,
  TextField,
  Divider,
  List,
  ListItem,
  Spinner,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";

import { stripeCatalog, StripeRenderer } from "../lib/render";
import { executeAction } from "../lib/render/catalog/actions";
import { API_GENERATE_URL } from "../lib/config";
import { streamSpec } from "../lib/stream-spec";

function createOverviewSpec(data: Record<string, unknown>): Spec {
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
        children: ["metrics", "divider", "refresh"],
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
      divider: { type: "Divider", props: {}, children: [] },
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

const FullPage = (_props: ExtensionContextValue) => {
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
      await streamSpec(
        API_GENERATE_URL,
        {
          prompt,
          systemPrompt: stripeCatalog.prompt({
            system:
              "You are a Stripe dashboard builder. Generate UI specs for displaying Stripe data in a full-page layout.",
          }),
        },
        (spec) => setCurrentSpec(spec),
      );
    } catch (err) {
      setCurrentSpec(createOverviewSpec(data));
      setError(
        `Using local generation (${err instanceof Error ? err.message : "API unavailable"})`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <FullPageView>
        <FullPageTabs>
          <FullPageTab
            id="overview"
            label="Overview"
            content={
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
            }
          />
        </FullPageTabs>
      </FullPageView>
    );
  }

  return (
    <FullPageView
      pageAction={{
        label: "Refresh Data",
        onPress: () => executeAction("refreshData", {}, handleSetState, {}),
      }}
    >
      <FullPageTabs>
        <FullPageTab
          id="overview"
          label="Overview"
          content={
            <Box css={{ stack: "y", gap: "large", padding: "large" }}>
              <StripeRenderer
                spec={createOverviewSpec(data)}
                data={data}
                setData={handleSetState}
                loading={false}
              />
            </Box>
          }
        />

        <FullPageTab
          id="generate"
          label="Generate"
          content={
            <Box css={{ stack: "y", gap: "medium", padding: "large" }}>
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
                <Box css={{ color: "secondary", font: "caption" }}>{error}</Box>
              )}

              {currentSpec && (
                <>
                  <Divider />
                  <Box css={{ font: "subheading" }}>
                    Preview (with real Stripe data)
                  </Box>
                  <Box
                    css={{
                      padding: "medium",
                      borderRadius: "medium",
                      keyline: "neutral",
                    }}
                  >
                    <StripeRenderer
                      spec={currentSpec}
                      data={data}
                      setData={handleSetState}
                      loading={isGenerating}
                    />
                  </Box>
                </>
              )}
            </Box>
          }
        />

        <FullPageTab
          id="components"
          label="Components"
          content={
            <Box css={{ padding: "large" }}>
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
          }
        />

        <FullPageTab
          id="actions"
          label="Actions"
          content={
            <Box css={{ padding: "large" }}>
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
          }
        />
      </FullPageTabs>
    </FullPageView>
  );
};

export default FullPage;
