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

function createProductsSpec(data: Record<string, unknown>): Spec {
  const products = data.products as
    | {
        data?: Array<{
          id: string;
          name: string;
          description: string;
          active: boolean;
          created: string;
        }>;
        total?: number;
        hasMore?: boolean;
      }
    | undefined;

  const prices = data.prices as
    | {
        data?: Array<{
          id: string;
          productId: string;
          formattedAmount: string;
          type: string;
          recurring?: { interval: string };
        }>;
      }
    | undefined;

  const productsList = products?.data ?? [];
  const pricesList = prices?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["heading", "metrics", "filters", "list", "pagination"],
    },
    heading: {
      type: "Heading",
      props: { text: "Products & Prices", size: "xlarge" },
      children: [],
    },
    metrics: {
      type: "Stack",
      props: { direction: "horizontal", gap: "medium" },
      children: ["productsMetric", "pricesMetric", "activeMetric"],
    },
    productsMetric: {
      type: "Metric",
      props: {
        label: "Total Products",
        value: String(products?.total ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    pricesMetric: {
      type: "Metric",
      props: {
        label: "Total Prices",
        value: String(pricesList.length ?? 0),
        changeType: "neutral",
      },
      children: [],
    },
    activeMetric: {
      type: "Metric",
      props: {
        label: "Active Products",
        value: String(productsList.filter((p) => p.active).length ?? 0),
        changeType: "positive",
      },
      children: [],
    },
    filters: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: ["refreshBtn", "createBtn"],
    },
    refreshBtn: {
      type: "Button",
      props: { label: "Refresh", action: "fetchProducts", type: "secondary" },
      children: [],
    },
    createBtn: {
      type: "Button",
      props: {
        label: "Create Product",
        action: "openDashboard",
        actionParams: { page: "products" },
        type: "primary",
      },
      children: [],
    },
    list: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: productsList.slice(0, 10).map((_, i) => `product${i}`),
    },
    pagination: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children: products?.hasMore ? ["loadMore"] : [],
    },
    loadMore: {
      type: "Button",
      props: {
        label: "Load More",
        action: "fetchProducts",
        actionParams: { limit: 10 },
        type: "secondary",
      },
      children: [],
    },
  };

  productsList.slice(0, 10).forEach((p, i) => {
    const productPrices = pricesList.filter((pr) => pr.productId === p.id);
    const priceDisplay =
      productPrices.length > 0
        ? productPrices
            .map(
              (pr) =>
                `${pr.formattedAmount}${pr.recurring ? `/${pr.recurring.interval}` : ""}`,
            )
            .join(", ")
        : "No prices";

    elements[`product${i}`] = {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: [`productCard${i}`],
    };

    elements[`productCard${i}`] = {
      type: "PropertyList",
      props: { orientation: "vertical" },
      children: [
        `productName${i}`,
        `productDesc${i}`,
        `productPrice${i}`,
        `productStatus${i}`,
      ],
    };

    elements[`productName${i}`] = {
      type: "PropertyListItem",
      props: { label: "Name", value: p.name },
      children: [],
    };

    elements[`productDesc${i}`] = {
      type: "PropertyListItem",
      props: { label: "Description", value: p.description || "No description" },
      children: [],
    };

    elements[`productPrice${i}`] = {
      type: "PropertyListItem",
      props: { label: "Prices", value: priceDisplay },
      children: [],
    };

    elements[`productStatus${i}`] = {
      type: "PropertyListItem",
      props: { label: "Status", value: p.active ? "Active" : "Archived" },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const Products = (_props: ExtensionContextValue) => {
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
      await Promise.all([
        executeAction("fetchProducts", { limit: 10 }, handleSetState, {}),
        executeAction("fetchPrices", { limit: 50 }, handleSetState, {}),
      ]);
      setLoading(false);
    };
    loadData();
  }, [handleSetState]);

  useEffect(() => {
    if (!loading && Object.keys(data).length > 0) {
      setSpec(createProductsSpec(data));
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
      setSpec(createProductsSpec(data));
    }

    setGenerating(false);
  };

  if (loading) {
    return (
      <ContextView title="Products" brandColor="#635BFF" brandIcon={BrandIcon}>
        <Box
          css={{
            stack: "y",
            gap: "medium",
            alignX: "center",
            paddingY: "xlarge",
          }}
        >
          <Spinner size="large" />
          <Box css={{ color: "secondary" }}>Loading products...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Products & Prices"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction(
              "openDashboard",
              { page: "products" },
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
              placeholder="Describe the products view you want..."
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

export default Products;
