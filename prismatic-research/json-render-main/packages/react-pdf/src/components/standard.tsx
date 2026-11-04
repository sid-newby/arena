import React from "react";
import {
  Document as PdfDocument,
  Page as PdfPage,
  View,
  Text as PdfText,
  Image as PdfImage,
  Link as PdfLink,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ComponentRenderProps } from "../renderer";
import type { ComponentRegistry } from "../renderer";
import type { StandardComponentProps } from "../catalog";

const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

function stripEmoji(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// =============================================================================
// Document Structure
// =============================================================================

function DocumentComponent({
  element,
  children,
}: ComponentRenderProps<StandardComponentProps<"Document">>) {
  const p = element.props;

  return (
    <PdfDocument
      title={p.title ?? undefined}
      author={p.author ?? undefined}
      subject={p.subject ?? undefined}
    >
      {children}
    </PdfDocument>
  );
}

function PageComponent({
  element,
  children,
}: ComponentRenderProps<StandardComponentProps<"Page">>) {
  const p = element.props;

  return (
    <PdfPage
      size={(p.size as any) ?? "A4"}
      orientation={p.orientation ?? "portrait"}
      style={{
        paddingTop: p.marginTop ?? 40,
        paddingBottom: p.marginBottom ?? 40,
        paddingLeft: p.marginLeft ?? 40,
        paddingRight: p.marginRight ?? 40,
        backgroundColor: p.backgroundColor ?? undefined,
        fontFamily: "Helvetica",
        fontSize: 12,
      }}
    >
      {children}
    </PdfPage>
  );
}

// =============================================================================
// Layout Components
// =============================================================================

function ViewComponent({
  element,
  children,
}: ComponentRenderProps<StandardComponentProps<"View">>) {
  const p = element.props;

  return (
    <View
      style={{
        padding: p.padding ?? undefined,
        paddingTop: p.paddingTop ?? undefined,
        paddingBottom: p.paddingBottom ?? undefined,
        paddingLeft: p.paddingLeft ?? undefined,
        paddingRight: p.paddingRight ?? undefined,
        margin: p.margin ?? undefined,
        backgroundColor: p.backgroundColor ?? undefined,
        borderWidth: p.borderWidth ?? undefined,
        borderColor: p.borderColor ?? undefined,
        borderRadius: p.borderRadius ?? undefined,
        flex: p.flex ?? undefined,
        alignItems: (p.alignItems as any) ?? undefined,
        justifyContent: (p.justifyContent as any) ?? undefined,
      }}
    >
      {children}
    </View>
  );
}

function RowComponent({
  element,
  children,
}: ComponentRenderProps<StandardComponentProps<"Row">>) {
  const p = element.props;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: p.gap ?? undefined,
        alignItems: (p.alignItems as any) ?? undefined,
        justifyContent: (p.justifyContent as any) ?? undefined,
        padding: p.padding ?? undefined,
        flex: p.flex ?? undefined,
        flexWrap: p.wrap ? "wrap" : undefined,
      }}
    >
      {children}
    </View>
  );
}

function ColumnComponent({
  element,
  children,
}: ComponentRenderProps<StandardComponentProps<"Column">>) {
  const p = element.props;

  return (
    <View
      style={{
        flexDirection: "column",
        gap: p.gap ?? undefined,
        alignItems: (p.alignItems as any) ?? undefined,
        justifyContent: (p.justifyContent as any) ?? undefined,
        padding: p.padding ?? undefined,
        flex: p.flex ?? undefined,
      }}
    >
      {children}
    </View>
  );
}

// =============================================================================
// Content Components
// =============================================================================

const headingStyles = StyleSheet.create({
  h1: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  h2: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  h3: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h4: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
});

function HeadingComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Heading">>) {
  const p = element.props;
  const level = p.level ?? "h2";

  return (
    <PdfText
      style={[
        headingStyles[level],
        {
          color: p.color ?? undefined,
          textAlign: p.align ?? "left",
        },
      ]}
    >
      {stripEmoji(p.text)}
    </PdfText>
  );
}

function TextComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Text">>) {
  const p = element.props;

  return (
    <PdfText
      style={{
        fontSize: p.fontSize ?? 12,
        color: p.color ?? undefined,
        textAlign: p.align ?? "left",
        fontFamily:
          p.fontWeight === "bold" && p.fontStyle === "italic"
            ? "Helvetica-BoldOblique"
            : p.fontWeight === "bold"
              ? "Helvetica-Bold"
              : p.fontStyle === "italic"
                ? "Helvetica-Oblique"
                : "Helvetica",
        lineHeight: p.lineHeight ?? undefined,
      }}
    >
      {stripEmoji(p.text)}
    </PdfText>
  );
}

function ImageComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Image">>) {
  const p = element.props;

  return (
    <PdfImage
      src={p.src}
      style={{
        width: p.width ?? undefined,
        height: p.height ?? undefined,
        objectFit: p.objectFit ?? "contain",
      }}
    />
  );
}

function LinkComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Link">>) {
  const p = element.props;

  return (
    <PdfLink
      src={p.href}
      style={{
        fontSize: p.fontSize ?? 12,
        color: p.color ?? "#2563eb",
        textDecoration: "underline",
      }}
    >
      {stripEmoji(p.text)}
    </PdfLink>
  );
}

// =============================================================================
// Data Components
// =============================================================================

const tableStyles = StyleSheet.create({
  table: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    padding: 6,
  },
  headerCell: {
    padding: 6,
    fontFamily: "Helvetica-Bold",
  },
  bottomBorder: {
    borderBottomWidth: 1,
  },
});

function TableComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Table">>) {
  const p = element.props;

  const borderColor = p.borderColor ?? "#e5e7eb";
  const fontSize = p.fontSize ?? 10;
  const defaultWidth = `${100 / p.columns.length}%`;

  return (
    <View style={tableStyles.table}>
      {/* Header */}
      <View
        style={[
          tableStyles.row,
          tableStyles.bottomBorder,
          {
            borderBottomColor: borderColor,
            backgroundColor: p.headerBackgroundColor ?? "#f3f4f6",
          },
        ]}
      >
        {p.columns.map((col, i) => (
          <View
            key={i}
            style={[
              tableStyles.headerCell,
              { width: col.width ?? defaultWidth },
            ]}
          >
            <PdfText
              style={{
                fontSize,
                color: p.headerTextColor ?? "#111827",
                textAlign: col.align ?? "left",
              }}
            >
              {stripEmoji(col.header)}
            </PdfText>
          </View>
        ))}
      </View>

      {/* Rows */}
      {p.rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            tableStyles.row,
            tableStyles.bottomBorder,
            {
              borderBottomColor: borderColor,
              backgroundColor:
                p.striped && rowIndex % 2 === 1 ? "#f9fafb" : undefined,
            },
          ]}
        >
          {p.columns.map((col, colIndex) => (
            <View
              key={colIndex}
              style={[tableStyles.cell, { width: col.width ?? defaultWidth }]}
            >
              <PdfText
                style={{
                  fontSize,
                  textAlign: col.align ?? "left",
                }}
              >
                {stripEmoji(row[colIndex] ?? "")}
              </PdfText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ListComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"List">>) {
  const p = element.props;

  const fontSize = p.fontSize ?? 12;
  const spacing = p.spacing ?? 4;

  return (
    <View style={{ gap: spacing }}>
      {p.items.map((item, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 6 }}>
          <PdfText
            style={{
              fontSize,
              color: p.color ?? undefined,
              width: p.ordered ? 20 : 12,
            }}
          >
            {p.ordered ? `${index + 1}.` : "\u2022"}
          </PdfText>
          <PdfText
            style={{
              fontSize,
              color: p.color ?? undefined,
              flex: 1,
            }}
          >
            {stripEmoji(item)}
          </PdfText>
        </View>
      ))}
    </View>
  );
}

// =============================================================================
// Decorative Components
// =============================================================================

function DividerComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Divider">>) {
  const p = element.props;

  return (
    <View
      style={{
        borderBottomWidth: p.thickness ?? 1,
        borderBottomColor: p.color ?? "#e5e7eb",
        marginTop: p.marginTop ?? 8,
        marginBottom: p.marginBottom ?? 8,
      }}
    />
  );
}

function SpacerComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"Spacer">>) {
  const p = element.props;

  return <View style={{ height: p.height ?? 20 }} />;
}

// =============================================================================
// Page-Level Components
// =============================================================================

function PageNumberComponent({
  element,
}: ComponentRenderProps<StandardComponentProps<"PageNumber">>) {
  const p = element.props;

  const format = p.format ?? "{pageNumber} / {totalPages}";

  return (
    <PdfText
      style={{
        fontSize: p.fontSize ?? 10,
        color: p.color ?? "#6b7280",
        textAlign: p.align ?? "center",
      }}
      render={({ pageNumber, totalPages }) =>
        stripEmoji(
          format
            .replace("{pageNumber}", String(pageNumber))
            .replace("{totalPages}", String(totalPages)),
        )
      }
      fixed
    />
  );
}

// =============================================================================
// Registry
// =============================================================================

export const standardComponents: ComponentRegistry = {
  Document: DocumentComponent,
  Page: PageComponent,
  View: ViewComponent,
  Row: RowComponent,
  Column: ColumnComponent,
  Heading: HeadingComponent,
  Text: TextComponent,
  Image: ImageComponent,
  Link: LinkComponent,
  Table: TableComponent,
  List: ListComponent,
  Divider: DividerComponent,
  Spacer: SpacerComponent,
  PageNumber: PageNumberComponent,
};
