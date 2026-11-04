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

function createPaymentDetailSpec(
  data: Record<string, unknown>,
  paymentId: string,
): Spec {
  const payments = data.payments as
    | {
        data?: Array<{
          id: string;
          amount: number;
          currency: string;
          status: string;
          description: string;
          created: string;
          formattedAmount: string;
          customerId?: string;
        }>;
      }
    | undefined;

  const payment = payments?.data?.find((p) => p.id === paymentId);

  const refunds = data.paymentRefunds as
    | {
        data?: Array<{
          id: string;
          amount: number;
          status: string;
          reason: string;
          created: string;
          formattedAmount: string;
        }>;
        total?: number;
      }
    | undefined;

  const refundsList = refunds?.data ?? [];

  const elements: Spec["elements"] = {
    root: {
      type: "Stack",
      props: { direction: "vertical", gap: "large" },
      children: ["header", "details", "actions", "refundsSection"],
    },
    header: {
      type: "Stack",
      props: {
        direction: "horizontal",
        gap: "medium",
        distribute: "space-between",
      },
      children: ["paymentInfo", "statusBadge"],
    },
    paymentInfo: {
      type: "Stack",
      props: { direction: "vertical", gap: "xsmall" },
      children: ["paymentAmount", "paymentId"],
    },
    paymentAmount: {
      type: "Heading",
      props: { text: payment?.formattedAmount ?? "$0.00", size: "xlarge" },
      children: [],
    },
    paymentId: {
      type: "Text",
      props: { content: paymentId, color: "secondary", size: "small" },
      children: [],
    },
    statusBadge: {
      type: "Badge",
      props: {
        label: payment?.status ?? "unknown",
        type:
          payment?.status === "succeeded"
            ? "positive"
            : payment?.status === "pending"
              ? "warning"
              : "negative",
      },
      children: [],
    },
    details: {
      type: "PropertyList",
      props: { orientation: "vertical" },
      children: [
        "detailDescription",
        "detailCreated",
        "detailCurrency",
        "detailCustomer",
      ],
    },
    detailDescription: {
      type: "PropertyListItem",
      props: {
        label: "Description",
        value: payment?.description ?? "No description",
      },
      children: [],
    },
    detailCreated: {
      type: "PropertyListItem",
      props: { label: "Created", value: payment?.created ?? "Unknown" },
      children: [],
    },
    detailCurrency: {
      type: "PropertyListItem",
      props: {
        label: "Currency",
        value: (payment?.currency ?? "usd").toUpperCase(),
      },
      children: [],
    },
    detailCustomer: {
      type: "PropertyListItem",
      props: { label: "Customer", value: payment?.customerId ?? "Guest" },
      children: [],
    },
    actions: {
      type: "Stack",
      props: { direction: "horizontal", gap: "small" },
      children:
        payment?.status === "succeeded"
          ? ["refundBtn", "viewBtn"]
          : ["viewBtn"],
    },
    refundBtn: {
      type: "Button",
      props: {
        label: "Refund Payment",
        action: "refundPayment",
        actionParams: { paymentId },
        type: "destructive",
      },
      children: [],
    },
    viewBtn: {
      type: "Button",
      props: {
        label: "View in Dashboard",
        action: "viewPayment",
        actionParams: { paymentId },
        type: "secondary",
      },
      children: [],
    },
    refundsSection: {
      type: "Accordion",
      props: {},
      children: ["refundsAccordion"],
    },
    refundsAccordion: {
      type: "AccordionItem",
      props: {
        title: `Refunds (${refunds?.total ?? 0})`,
        defaultOpen: refundsList.length > 0,
      },
      children: refundsList.length > 0 ? ["refundsList"] : ["noRefunds"],
    },
    refundsList: {
      type: "Stack",
      props: { direction: "vertical", gap: "small" },
      children: refundsList.slice(0, 5).map((_, i) => `refund${i}`),
    },
    noRefunds: {
      type: "Text",
      props: { content: "No refunds", color: "secondary" },
      children: [],
    },
  };

  refundsList.slice(0, 5).forEach((r, i) => {
    elements[`refund${i}`] = {
      type: "RefundCard",
      props: {
        amount: r.amount,
        currency: "usd",
        status: r.status as "pending" | "succeeded" | "failed" | "canceled",
        reason: r.reason,
      },
      children: [],
    };
  });

  return { root: "root", elements };
}

// =============================================================================
// Component
// =============================================================================

const PaymentDetails = ({ environment }: ExtensionContextValue) => {
  const [data, setState] = useState<Record<string, unknown>>({});
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const paymentId = environment?.objectContext?.id ?? "";

  const handleSetState = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setState((prev) => updater(prev));
    },
    [],
  );

  useEffect(() => {
    const loadData = async () => {
      if (!paymentId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      await Promise.all([
        executeAction("fetchPayments", { limit: 100 }, handleSetState, {}),
        executeAction(
          "fetchRefunds",
          { paymentIntentId: paymentId, limit: 10 },
          (updater) => {
            setState((prev) => {
              const next = updater(prev);
              return { ...prev, paymentRefunds: next.refunds };
            });
          },
          {},
        ),
      ]);

      setLoading(false);
    };
    loadData();
  }, [paymentId, handleSetState]);

  useEffect(() => {
    if (!loading && paymentId) {
      setSpec(createPaymentDetailSpec(data, paymentId));
    }
  }, [data, loading, paymentId]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);

    const systemPrompt = stripeCatalog.prompt();

    try {
      const response = await fetch(API_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `For payment ${paymentId}: ${prompt}`,
          systemPrompt,
        }),
      });

      const result = await response.json();
      if (result.spec) {
        setSpec(result.spec);
      }
    } catch (error) {
      console.error("Generation error:", error);
      setSpec(createPaymentDetailSpec(data, paymentId));
    }

    setGenerating(false);
  };

  if (!paymentId) {
    return (
      <ContextView
        title="Payment Details"
        brandColor="#635BFF"
        brandIcon={BrandIcon}
      >
        <Box css={{ color: "secondary", padding: "large" }}>
          No payment selected. Please select a payment from the list.
        </Box>
      </ContextView>
    );
  }

  if (loading) {
    return (
      <ContextView
        title="Payment Details"
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
          <Box css={{ color: "secondary" }}>Loading payment details...</Box>
        </Box>
      </ContextView>
    );
  }

  return (
    <ContextView
      title="Payment Details"
      brandColor="#635BFF"
      brandIcon={BrandIcon}
      actions={
        <Button
          type="primary"
          onPress={() =>
            executeAction("viewPayment", { paymentId }, handleSetState, data)
          }
        >
          View in Dashboard
        </Button>
      }
    >
      <Box css={{ stack: "y", gap: "medium" }}>
        <Box css={{ stack: "x", gap: "small" }}>
          <Box css={{ width: "fill" }}>
            <TextField
              label=""
              placeholder="Describe the payment view you want..."
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

export default PaymentDetails;
