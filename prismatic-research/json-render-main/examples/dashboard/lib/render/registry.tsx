"use client";

import { toast } from "sonner";
import { findFormValue } from "@json-render/core";
import { useBoundProp, defineRegistry } from "@json-render/react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// shadcn components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

import { dashboardCatalog } from "./catalog";

// =============================================================================
// Registry
// =============================================================================

export const { registry, handlers, executeAction } = defineRegistry(
  dashboardCatalog,
  {
    components: {
      Stack: ({ props, children }) => {
        const gapClass =
          { sm: "gap-2", md: "gap-4", lg: "gap-6" }[props.gap ?? "md"] ??
          "gap-4";
        return (
          <div
            className={`flex ${props.direction === "horizontal" ? "flex-row" : "flex-col"} ${gapClass}`}
          >
            {children}
          </div>
        );
      },

      Accordion: ({ props, children }) => (
        <Accordion type={props.type ?? "single"} collapsible>
          {children}
        </Accordion>
      ),

      AccordionItem: ({ props, children }) => (
        <AccordionItem value={props.value}>
          <AccordionTrigger>{props.title}</AccordionTrigger>
          <AccordionContent>{children}</AccordionContent>
        </AccordionItem>
      ),

      Button: ({ props, emit, loading }) => (
        <Button
          variant={props.variant ?? "default"}
          disabled={loading || (props.disabled ?? false)}
          onClick={() => emit("press")}
        >
          {loading ? "..." : props.label}
        </Button>
      ),

      Input: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(
          props.value as string | undefined,
          bindings?.value,
        );
        return (
          <div className="flex flex-col gap-2">
            {props.label ? <Label>{props.label}</Label> : null}
            <Input
              type={props.type ?? "text"}
              value={value ?? ""}
              placeholder={props.placeholder ?? ""}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        );
      },

      Form: ({ children, emit }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            emit("submit");
          }}
          className="flex flex-col gap-4"
        >
          {children}
        </form>
      ),

      Badge: ({ props }) => (
        <Badge variant={props.variant ?? "default"}>{props.text}</Badge>
      ),

      Alert: ({ props }) => (
        <Alert variant={props.variant ?? "default"}>
          <AlertTitle>{props.title}</AlertTitle>
          {props.description ? (
            <AlertDescription>{props.description}</AlertDescription>
          ) : null}
        </Alert>
      ),

      Separator: () => <Separator />,

      Avatar: ({ props }) => (
        <Avatar>
          {props.src ? (
            <AvatarImage src={props.src} alt={props.alt ?? ""} />
          ) : null}
          <AvatarFallback>{props.fallback}</AvatarFallback>
        </Avatar>
      ),

      Checkbox: ({ props, bindings }) => {
        const [checked, setChecked] = useBoundProp<boolean>(
          props.checked as boolean | undefined,
          bindings?.checked,
        );
        const isChecked = checked ?? props.defaultChecked ?? false;
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={bindings?.checked ?? "checkbox"}
              checked={isChecked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            {props.label ? (
              <Label htmlFor={bindings?.checked ?? "checkbox"}>
                {props.label}
              </Label>
            ) : null}
          </div>
        );
      },

      Dialog: ({ props, children }) => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{props.trigger}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{props.title}</DialogTitle>
              {props.description ? (
                <DialogDescription>{props.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            {children}
          </DialogContent>
        </Dialog>
      ),

      Drawer: ({ props, children }) => (
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">{props.trigger}</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{props.title}</DrawerTitle>
              {props.description ? (
                <DrawerDescription>{props.description}</DrawerDescription>
              ) : null}
            </DrawerHeader>
            <div className="p-4">{children}</div>
          </DrawerContent>
        </Drawer>
      ),

      DropdownMenu: ({ props }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{props.trigger}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {props.items.map((item, i) => (
              <DropdownMenuItem key={i}>{item.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ),

      Label: ({ props }) => (
        <Label htmlFor={props.htmlFor ?? undefined}>{props.text}</Label>
      ),

      Pagination: ({ props }) => {
        const pages = Array.from({ length: props.totalPages }, (_, i) => i + 1);
        return (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              {pages.map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    isActive={page === props.currentPage}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        );
      },

      Popover: ({ props, children }) => (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{props.trigger}</Button>
          </PopoverTrigger>
          <PopoverContent>{children}</PopoverContent>
        </Popover>
      ),

      Progress: ({ props }) => (
        <Progress value={props.value} max={props.max ?? 100} />
      ),

      RadioGroup: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(
          props.value as string | undefined,
          bindings?.value,
        );
        const current = value ?? props.defaultValue ?? "";
        return (
          <RadioGroup value={current} onValueChange={(v) => setValue(v)}>
            {props.options.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem value={option.value} id={option.value} />
                <Label htmlFor={option.value}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      },

      Select: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(
          props.value as string | undefined,
          bindings?.value,
        );
        return (
          <Select value={value ?? ""} onValueChange={(v) => setValue(v)}>
            <SelectTrigger>
              <SelectValue placeholder={props.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {props.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },

      Skeleton: ({ props }) => (
        <Skeleton
          className={`${props.width ?? "w-full"} ${props.height ?? "h-4"}`}
        />
      ),

      Spinner: ({ props }) => {
        const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" };
        const size = sizes[props.size ?? "md"];
        return (
          <div
            className={`${size} animate-spin rounded-full border-2 border-muted border-t-primary`}
          />
        );
      },

      Switch: ({ props, bindings }) => {
        const [checked, setChecked] = useBoundProp<boolean>(
          props.checked as boolean | undefined,
          bindings?.checked,
        );
        const isChecked = checked ?? props.defaultChecked ?? false;
        return (
          <div className="flex items-center gap-2">
            <Switch
              id={bindings?.checked ?? "switch"}
              checked={isChecked}
              onCheckedChange={(value) => setChecked(value)}
            />
            {props.label ? (
              <Label htmlFor={bindings?.checked ?? "switch"}>
                {props.label}
              </Label>
            ) : null}
          </div>
        );
      },

      Tabs: ({ props, children }) => (
        <Tabs defaultValue={props.defaultValue ?? props.tabs[0]?.value}>
          <TabsList>
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {children}
        </Tabs>
      ),

      TabContent: ({ props, children }) => (
        <TabsContent value={props.value}>{children}</TabsContent>
      ),

      Textarea: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(
          props.value as string | undefined,
          bindings?.value,
        );
        return (
          <div className="flex flex-col gap-2">
            {props.label ? <Label>{props.label}</Label> : null}
            <Textarea
              value={value ?? ""}
              placeholder={props.placeholder ?? ""}
              rows={props.rows ?? 3}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        );
      },

      Tooltip: ({ props, children }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent>{props.content}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),

      // Heading is intentionally not rendered - widgets already have a title bar
      Heading: () => null,

      Text: ({ props }) => (
        <p className={props.muted ? "text-muted-foreground" : ""}>
          {props.content}
        </p>
      ),

      Table: ({ props }) => {
        const rawData = props.data;

        const items: Array<Record<string, unknown>> = Array.isArray(rawData)
          ? rawData
          : Array.isArray((rawData as Record<string, unknown>)?.data)
            ? ((rawData as Record<string, unknown>).data as Array<
                Record<string, unknown>
              >)
            : Array.isArray((rawData as Record<string, unknown>)?.items)
              ? ((rawData as Record<string, unknown>).items as Array<
                  Record<string, unknown>
                >)
              : [];

        if (items.length === 0) {
          return (
            <div className="text-center py-4 text-muted-foreground">
              {props.emptyMessage ?? "No data"}
            </div>
          );
        }

        const hasRowActions = props.rowActions && props.rowActions.length > 0;

        return (
          <Table>
            <TableHeader>
              <TableRow>
                {props.columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
                {hasRowActions ? <TableHead>Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  {props.columns.map((col) => (
                    <TableCell key={col.key}>
                      {String(item[col.key] ?? "")}
                    </TableCell>
                  ))}
                  {hasRowActions ? (
                    <TableCell>
                      <div className="flex gap-1">
                        {props.rowActions!.map((rowAction) => (
                          <Button
                            key={rowAction.action}
                            variant={rowAction.variant ?? "ghost"}
                            size="sm"
                          >
                            {rowAction.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      },

      BarChart: ({ props }) => {
        const rawData = props.data;

        const rawItems: Array<Record<string, unknown>> = Array.isArray(rawData)
          ? rawData
          : Array.isArray((rawData as Record<string, unknown>)?.data)
            ? ((rawData as Record<string, unknown>).data as Array<
                Record<string, unknown>
              >)
            : [];

        // Process and aggregate data
        const { items, valueKey } = processChartData(
          rawItems,
          props.xKey,
          props.yKey,
          props.aggregate,
        );

        const chartColor = props.color ?? "var(--chart-1)";

        const chartConfig = {
          [valueKey]: {
            label: valueKey,
            color: chartColor,
          },
        } satisfies ChartConfig;

        if (items.length === 0) {
          return (
            <div className="w-full">
              <div className="text-center py-4 text-muted-foreground">
                No data available
              </div>
            </div>
          );
        }

        return (
          <div className="w-full">
            <ChartContainer
              config={chartConfig}
              className="min-h-[200px] w-full"
              style={{ height: props.height ?? 300 }}
            >
              <RechartsBarChart accessibilityLayer data={items}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey={valueKey}
                  fill={`var(--color-${valueKey})`}
                  radius={4}
                />
              </RechartsBarChart>
            </ChartContainer>
          </div>
        );
      },

      LineChart: ({ props }) => {
        const rawData = props.data;

        const rawItems: Array<Record<string, unknown>> = Array.isArray(rawData)
          ? rawData
          : Array.isArray((rawData as Record<string, unknown>)?.data)
            ? ((rawData as Record<string, unknown>).data as Array<
                Record<string, unknown>
              >)
            : [];

        // Process and aggregate data
        const { items, valueKey } = processChartData(
          rawItems,
          props.xKey,
          props.yKey,
          props.aggregate,
        );

        const chartColor = props.color ?? "var(--chart-1)";

        const chartConfig = {
          [valueKey]: {
            label: valueKey,
            color: chartColor,
          },
        } satisfies ChartConfig;

        if (items.length === 0) {
          return (
            <div className="w-full">
              <div className="text-center py-4 text-muted-foreground">
                No data available
              </div>
            </div>
          );
        }

        return (
          <div className="w-full">
            <ChartContainer
              config={chartConfig}
              className="min-h-[200px] w-full"
              style={{ height: props.height ?? 300 }}
            >
              <RechartsLineChart accessibilityLayer data={items}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey={valueKey}
                  stroke={`var(--color-${valueKey})`}
                  strokeWidth={2}
                  dot={false}
                />
              </RechartsLineChart>
            </ChartContainer>
          </div>
        );
      },
    },

    actions: {
      viewCustomers: async (params, setState) => {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.set("limit", String(params.limit));
        if (params?.sort) queryParams.set("sort", String(params.sort));
        if (params?.status) queryParams.set("status", String(params.status));
        const url = `/api/v1/customers${queryParams.toString() ? `?${queryParams}` : ""}`;
        const res = await fetch(url);
        const customers = await res.json();
        setState((prev) => ({ ...prev, customers }));
      },

      refreshCustomers: async (params, setState) => {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.set("limit", String(params.limit));
        if (params?.sort) queryParams.set("sort", String(params.sort));
        const url = `/api/v1/customers${queryParams.toString() ? `?${queryParams}` : ""}`;
        const res = await fetch(url);
        const customers = await res.json();
        setState((prev) => ({ ...prev, customers }));
      },

      createCustomer: async (params, setState, state) => {
        const name = findFormValue("name", params, state) as string;
        const email =
          (findFormValue("email", params, state) as string) ||
          `${name?.toLowerCase().replace(/\s+/g, ".")}@example.com`;
        const phone = findFormValue("phone", params, state) as
          | string
          | undefined;

        if (!name) {
          toast.error("Customer name is required");
          return;
        }

        try {
          const res = await fetch("/api/v1/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone }),
          });
          const customer = await res.json();
          if (res.ok) {
            toast.success(`Customer "${customer.name}" created`);
            const listRes = await fetch("/api/v1/customers");
            const customers = await listRes.json();
            setState((prev) => ({ ...prev, customers }));
          } else {
            toast.error(customer.error || "Failed to create customer");
          }
        } catch (err) {
          console.error("Failed to create customer:", err);
          toast.error("Failed to create customer");
        }
      },

      deleteCustomer: async (params, setState, state) => {
        const customerId =
          findFormValue("customerId", params, state) ||
          findFormValue("id", params, state);
        if (!customerId) {
          toast.error("Customer ID required");
          return;
        }
        try {
          const res = await fetch(`/api/v1/customers/${customerId}`, {
            method: "DELETE",
          });
          if (res.ok) {
            toast.success("Customer deleted");
            const listRes = await fetch("/api/v1/customers");
            const customers = await listRes.json();
            setState((prev) => ({ ...prev, customers }));
          } else {
            const err = await res.json();
            toast.error(err.error || "Failed to delete customer");
          }
        } catch (err) {
          console.error("Failed to delete customer:", err);
          toast.error("Failed to delete customer");
        }
      },

      viewInvoices: async (params, setState) => {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set("status", String(params.status));
        const url = `/api/v1/invoices${queryParams.toString() ? `?${queryParams}` : ""}`;
        const res = await fetch(url);
        const invoices = await res.json();
        setState((prev) => ({ ...prev, invoices }));
      },

      refreshInvoices: async (_params, setState) => {
        const res = await fetch("/api/v1/invoices");
        const invoices = await res.json();
        setState((prev) => ({ ...prev, invoices }));
      },

      createInvoice: async (params, setState) => {
        if (!params?.customerId || !params?.dueDate) {
          toast.error("Customer ID and due date required");
          return;
        }
        try {
          const res = await fetch("/api/v1/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          });
          const invoice = await res.json();
          if (res.ok) {
            toast.success("Invoice created");
            const listRes = await fetch("/api/v1/invoices");
            const invoices = await listRes.json();
            setState((prev) => ({ ...prev, invoices }));
          } else {
            toast.error(invoice.error || "Failed to create invoice");
          }
        } catch (err) {
          console.error("Failed to create invoice:", err);
          toast.error("Failed to create invoice");
        }
      },

      sendInvoice: async (params) => {
        if (!params?.invoiceId) {
          toast.error("Invoice ID required");
          return;
        }
        const res = await fetch(`/api/v1/invoices/${params.invoiceId}/send`, {
          method: "POST",
        });
        const result = await res.json();
        if (res.ok) {
          toast.success(result.message || "Invoice sent");
        } else {
          toast.error(result.error || "Failed to send invoice");
        }
      },

      markInvoicePaid: async (params) => {
        if (!params?.invoiceId) {
          toast.error("Invoice ID required");
          return;
        }
        const res = await fetch(
          `/api/v1/invoices/${params.invoiceId}/mark-paid`,
          { method: "POST" },
        );
        const result = await res.json();
        if (res.ok) {
          toast.success(result.message || "Invoice marked paid");
        } else {
          toast.error(result.error || "Failed to mark invoice paid");
        }
      },

      viewExpenses: async (params, setState) => {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set("status", String(params.status));
        const url = `/api/v1/expenses${queryParams.toString() ? `?${queryParams}` : ""}`;
        const res = await fetch(url);
        const expenses = await res.json();
        setState((prev) => ({ ...prev, expenses }));
      },

      refreshExpenses: async (_params, setState) => {
        const res = await fetch("/api/v1/expenses");
        const expenses = await res.json();
        setState((prev) => ({ ...prev, expenses }));
      },

      createExpense: async (params, setState) => {
        if (
          !params?.vendor ||
          !params?.category ||
          params?.amount === undefined
        ) {
          toast.error("Vendor, category, and amount required");
          return;
        }
        try {
          const res = await fetch("/api/v1/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          });
          const expense = await res.json();
          if (res.ok) {
            toast.success("Expense created");
            const listRes = await fetch("/api/v1/expenses");
            const expenses = await listRes.json();
            setState((prev) => ({ ...prev, expenses }));
          } else {
            toast.error(expense.error || "Failed to create expense");
          }
        } catch (err) {
          console.error("Failed to create expense:", err);
          toast.error("Failed to create expense");
        }
      },

      approveExpense: async (params) => {
        if (!params?.expenseId) {
          toast.error("Expense ID required");
          return;
        }
        const res = await fetch(
          `/api/v1/expenses/${params.expenseId}/approve`,
          { method: "POST" },
        );
        const result = await res.json();
        if (res.ok) {
          toast.success(result.message || "Expense approved");
        } else {
          toast.error(result.error || "Failed to approve expense");
        }
      },
    },
  },
);

// =============================================================================
// Chart Helpers
// =============================================================================

function isISODate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function processChartData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  aggregate: "sum" | "count" | "avg" | null | undefined,
): { items: Array<Record<string, unknown>>; valueKey: string } {
  if (items.length === 0) {
    return { items: [], valueKey: yKey };
  }

  const firstXValue = items[0]?.[xKey];
  const isDateKey = isISODate(firstXValue);

  if (!aggregate) {
    const formatted = items.map((item) => {
      const xValue = item[xKey];
      return {
        ...item,
        label:
          isDateKey && typeof xValue === "string"
            ? formatDateLabel(xValue)
            : String(xValue ?? ""),
      };
    });
    return { items: formatted, valueKey: yKey };
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const item of items) {
    const xValue = item[xKey];
    let groupKey: string;

    if (isDateKey && typeof xValue === "string") {
      groupKey = xValue.split("T")[0] ?? xValue;
    } else {
      groupKey = String(xValue ?? "unknown");
    }

    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const valueKey = aggregate === "count" ? "count" : yKey;
  const aggregated: Array<Record<string, unknown>> = [];
  const sortedKeys = Array.from(groups.keys()).sort();

  for (const key of sortedKeys) {
    const group = groups.get(key)!;
    let value: number;

    if (aggregate === "count") {
      value = group.length;
    } else if (aggregate === "sum") {
      value = group.reduce((sum, item) => {
        const v = item[yKey];
        return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
    } else {
      const sum = group.reduce((s, item) => {
        const v = item[yKey];
        return s + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
      value = group.length > 0 ? sum / group.length : 0;
    }

    let label: string;
    if (isDateKey) {
      const date = new Date(key);
      label = date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      });
    } else {
      label = key;
    }

    aggregated.push({
      label,
      [valueKey]: value,
      _groupKey: key,
    });
  }

  return { items: aggregated, valueKey };
}

// =============================================================================
// Fallback Component
// =============================================================================

export function Fallback({ type }: { type: string }) {
  return (
    <div className="p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
      Unknown component: {type}
    </div>
  );
}
