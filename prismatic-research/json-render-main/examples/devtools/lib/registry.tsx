import { defineRegistry, useBoundProp } from "@json-render/react";
import { catalog } from "./catalog";

// ---------------------------------------------------------------------------
// Shared tokens
// ---------------------------------------------------------------------------

const gapMap = { xs: 4, sm: 8, md: 12, lg: 20 } as const;

const cardToneBg = {
  default: "var(--surface-raised)",
  accent: "color-mix(in oklab, var(--accent) 8%, var(--surface-raised))",
  success: "color-mix(in oklab, var(--success) 8%, var(--surface-raised))",
  warn: "color-mix(in oklab, var(--warn) 10%, var(--surface-raised))",
  muted: "var(--surface-muted)",
} as const;

const cardToneBorder = {
  default: "var(--border)",
  accent: "color-mix(in oklab, var(--accent) 45%, var(--border))",
  success: "color-mix(in oklab, var(--success) 45%, var(--border))",
  warn: "color-mix(in oklab, var(--warn) 45%, var(--border))",
  muted: "var(--border)",
} as const;

const badgeTones = {
  default: { bg: "var(--surface-muted)", fg: "var(--text)" },
  accent: {
    bg: "color-mix(in oklab, var(--accent) 15%, transparent)",
    fg: "var(--accent)",
  },
  success: {
    bg: "color-mix(in oklab, var(--success) 15%, transparent)",
    fg: "var(--success)",
  },
  warn: {
    bg: "color-mix(in oklab, var(--warn) 15%, transparent)",
    fg: "var(--warn)",
  },
  muted: { bg: "var(--surface-muted)", fg: "var(--text-muted)" },
} as const;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => {
      const tone = props.tone ?? "default";
      return (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: `1px solid ${cardToneBorder[tone]}`,
            background: cardToneBg[tone],
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {(props.title || props.subtitle) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {props.title && (
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {props.title}
                </div>
              )}
              {props.subtitle && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {props.subtitle}
                </div>
              )}
            </div>
          )}
          {children}
        </div>
      );
    },

    Heading: ({ props }) => {
      const level = props.level ?? "2";
      const sizes = { "1": 22, "2": 16, "3": 13 } as const;
      const Tag = `h${level}` as unknown as "h1";
      return (
        <Tag
          style={{
            margin: 0,
            fontWeight: 600,
            fontSize: sizes[level],
            lineHeight: 1.3,
          }}
        >
          {props.text}
        </Tag>
      );
    },

    Text: ({ props }) => {
      const weight =
        props.weight === "bold" ? 700 : props.weight === "medium" ? 500 : 400;
      return (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            fontWeight: weight,
            color: props.muted ? "var(--text-muted)" : "var(--text)",
          }}
        >
          {props.text}
        </p>
      );
    },

    Stack: ({ props, children }) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: gapMap[props.gap ?? "sm"],
        }}
      >
        {children}
      </div>
    ),

    Row: ({ props, children }) => {
      const alignMap = {
        start: "flex-start",
        center: "center",
        end: "flex-end",
        between: "space-between",
      } as const;
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: gapMap[props.gap ?? "sm"],
            alignItems: "center",
            justifyContent: alignMap[props.align ?? "start"],
            flexWrap: "wrap",
          }}
        >
          {children}
        </div>
      );
    },

    Grid: ({ props, children }) => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${props.columns ?? "2"}, minmax(0, 1fr))`,
          gap: gapMap[props.gap ?? "md"],
        }}
      >
        {children}
      </div>
    ),

    Metric: ({ props }) => {
      const trendColor =
        props.trend === "up"
          ? "var(--success)"
          : props.trend === "down"
            ? "var(--warn)"
            : "var(--text-muted)";
      const trendGlyph =
        props.trend === "up" ? "↑" : props.trend === "down" ? "↓" : "→";
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {props.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>
            {props.value}
          </div>
          {props.delta && (
            <div style={{ fontSize: 11, color: trendColor }}>
              {trendGlyph} {props.delta}
            </div>
          )}
        </div>
      );
    },

    Badge: ({ props }) => {
      const tone = badgeTones[props.tone ?? "default"];
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            background: tone.bg,
            color: tone.fg,
          }}
        >
          {props.label}
        </span>
      );
    },

    Divider: () => (
      <hr
        style={{
          border: 0,
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />
    ),

    Button: ({ props, emit }) => {
      const variant = props.variant ?? "primary";
      const size = props.size ?? "md";
      const base: React.CSSProperties = {
        padding: size === "sm" ? "4px 10px" : "6px 12px",
        borderRadius: 8,
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: 500,
        cursor: props.disabled ? "not-allowed" : "pointer",
        border: "1px solid transparent",
        transition: "background 0.15s",
        opacity: props.disabled ? 0.5 : 1,
      };
      const variants: Record<string, React.CSSProperties> = {
        primary: {
          background: "var(--accent)",
          color: "var(--accent-fg)",
        },
        secondary: {
          background: "var(--surface-muted)",
          color: "var(--text)",
          borderColor: "var(--border)",
        },
        ghost: {
          background: "transparent",
          color: "var(--text)",
        },
      };
      return (
        <button
          type="button"
          disabled={props.disabled ?? false}
          onClick={() => emit("press")}
          style={{ ...base, ...variants[variant] }}
        >
          {props.label}
        </button>
      );
    },

    TextInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(
        (props.value ?? "") as string,
        bindings?.value,
      );
      return (
        <input
          type="text"
          value={value ?? ""}
          placeholder={props.placeholder ?? ""}
          onChange={(e) => setValue(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
            outline: "none",
            width: "100%",
          }}
        />
      );
    },

    Checkbox: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(
        props.checked ?? false,
        bindings?.checked,
      );
      return (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          {props.label && <span>{props.label}</span>}
        </label>
      );
    },

    ProgressBar: ({ props }) => {
      const max = props.max ?? 100;
      const value = Math.max(0, Math.min(max, props.value));
      const pct = (value / max) * 100;
      const color =
        props.tone === "success"
          ? "var(--success)"
          : props.tone === "warn"
            ? "var(--warn)"
            : props.tone === "accent"
              ? "var(--accent)"
              : "var(--text-muted)";
      return (
        <div
          style={{
            width: "100%",
            height: 6,
            background: "var(--surface-muted)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: color,
              transition: "width 0.3s",
            }}
          />
        </div>
      );
    },

    Callout: ({ props }) => {
      const tone = props.tone ?? "info";
      const toneBg = {
        info: "color-mix(in oklab, var(--accent) 10%, transparent)",
        success: "color-mix(in oklab, var(--success) 10%, transparent)",
        warn: "color-mix(in oklab, var(--warn) 12%, transparent)",
        tip: "color-mix(in oklab, var(--accent) 8%, transparent)",
      } as const;
      const toneBorder = {
        info: "color-mix(in oklab, var(--accent) 30%, var(--border))",
        success: "color-mix(in oklab, var(--success) 30%, var(--border))",
        warn: "color-mix(in oklab, var(--warn) 35%, var(--border))",
        tip: "color-mix(in oklab, var(--accent) 25%, var(--border))",
      } as const;
      return (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${toneBorder[tone]}`,
            background: toneBg[tone],
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {props.title && (
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {props.title}
            </div>
          )}
          <div>{props.text}</div>
        </div>
      );
    },

    // List is an unstyled flex-column container on purpose: when repeated
    // children are interactive (Row with Checkbox + Button), a framed
    // container looks like "a card in a card". ListItem below paints its
    // own subtle top border between rows to keep a clear separator.
    List: ({ children }) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    ),

    ListItem: ({ props }) => (
      <div
        className="jr-list-item"
        style={{
          padding: "8px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{props.title}</div>
          {props.description && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {props.description}
            </div>
          )}
        </div>
        {props.meta && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {props.meta}
          </div>
        )}
      </div>
    ),

    Avatar: ({ props }) => {
      const tones = {
        default: { bg: "var(--surface-muted)", fg: "var(--text)" },
        accent: {
          bg: "color-mix(in oklab, var(--accent) 20%, transparent)",
          fg: "var(--accent)",
        },
        success: {
          bg: "color-mix(in oklab, var(--success) 20%, transparent)",
          fg: "var(--success)",
        },
        warn: {
          bg: "color-mix(in oklab, var(--warn) 20%, transparent)",
          fg: "var(--warn)",
        },
      } as const;
      const t = tones[props.tone ?? "default"];
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 999,
            background: t.bg,
            color: t.fg,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {props.initials.slice(0, 2).toUpperCase()}
        </span>
      );
    },
  },
});
