import type { Spec } from "@json-render/core";

export interface Example {
  name: string;
  label: string;
  description: string;
  spec: Spec;
}

export const examples: Example[] = [
  // =========================================================================
  // Invoice
  // =========================================================================
  {
    name: "invoice",
    label: "Invoice",
    description:
      "A professional invoice with company header, billing details, line items, and totals",
    spec: {
      root: "doc",
      elements: {
        doc: {
          type: "Document",
          props: { title: "Invoice #1042", author: "Acme Corp", subject: null },
          children: ["page"],
        },
        page: {
          type: "Page",
          props: {
            size: "A4",
            orientation: null,
            marginTop: 50,
            marginBottom: 50,
            marginLeft: 50,
            marginRight: 50,
            backgroundColor: null,
          },
          children: [
            "header",
            "spacer-1",
            "billing-row",
            "spacer-2",
            "items-table",
            "spacer-3",
            "totals",
            "spacer-4",
            "footer",
            "page-num",
          ],
        },

        // Header
        header: {
          type: "Row",
          props: {
            gap: null,
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["company-name", "invoice-info"],
        },
        "company-name": {
          type: "Heading",
          props: {
            text: "Acme Corp",
            level: "h1",
            color: "#1a202c",
            align: null,
          },
        },
        "invoice-info": {
          type: "Column",
          props: {
            gap: 2,
            alignItems: "flex-end",
            justifyContent: null,
            padding: null,
            flex: null,
          },
          children: ["inv-number", "inv-date", "inv-due"],
        },
        "inv-number": {
          type: "Text",
          props: {
            text: "Invoice #1042",
            fontSize: 12,
            color: "#4a5568",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "inv-date": {
          type: "Text",
          props: {
            text: "Date: February 19, 2026",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "inv-due": {
          type: "Text",
          props: {
            text: "Due: March 19, 2026",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-1": { type: "Spacer", props: { height: 30 } },

        // Billing info
        "billing-row": {
          type: "Row",
          props: {
            gap: 40,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["bill-from", "bill-to"],
        },
        "bill-from": {
          type: "Column",
          props: {
            gap: 4,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: 1,
          },
          children: ["from-label", "from-name", "from-addr", "from-email"],
        },
        "from-label": {
          type: "Text",
          props: {
            text: "From",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "from-name": {
          type: "Text",
          props: {
            text: "Acme Corp",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "from-addr": {
          type: "Text",
          props: {
            text: "123 Business Ave, Suite 100\nSan Francisco, CA 94102",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.4,
          },
        },
        "from-email": {
          type: "Text",
          props: {
            text: "billing@acmecorp.com",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "bill-to": {
          type: "Column",
          props: {
            gap: 4,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: 1,
          },
          children: ["to-label", "to-name", "to-addr", "to-email"],
        },
        "to-label": {
          type: "Text",
          props: {
            text: "Bill To",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "to-name": {
          type: "Text",
          props: {
            text: "Globex Corporation",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "to-addr": {
          type: "Text",
          props: {
            text: "456 Client Road\nNew York, NY 10001",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.4,
          },
        },
        "to-email": {
          type: "Text",
          props: {
            text: "accounts@globex.com",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-2": { type: "Spacer", props: { height: 30 } },

        // Items table
        "items-table": {
          type: "Table",
          props: {
            columns: [
              { header: "Description", width: "45%", align: null },
              { header: "Qty", width: "10%", align: "center" },
              { header: "Unit Price", width: "20%", align: "right" },
              { header: "Amount", width: "25%", align: "right" },
            ],
            rows: [
              ["Website Redesign", "1", "$5,000.00", "$5,000.00"],
              ["SEO Optimization", "1", "$2,500.00", "$2,500.00"],
              ["Content Writing (per page)", "12", "$150.00", "$1,800.00"],
              ["Monthly Hosting", "6", "$50.00", "$300.00"],
            ],
            headerBackgroundColor: "#2d3748",
            headerTextColor: "#ffffff",
            borderColor: "#e2e8f0",
            fontSize: 10,
            striped: true,
          },
        },

        "spacer-3": { type: "Spacer", props: { height: 20 } },

        // Totals
        totals: {
          type: "Column",
          props: {
            gap: 4,
            alignItems: "flex-end",
            justifyContent: null,
            padding: null,
            flex: null,
          },
          children: ["subtotal", "tax", "divider-totals", "total"],
        },
        subtotal: {
          type: "Text",
          props: {
            text: "Subtotal: $9,600.00",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        tax: {
          type: "Text",
          props: {
            text: "Tax (8.5%): $816.00",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "divider-totals": {
          type: "Divider",
          props: {
            color: "#2d3748",
            thickness: 2,
            marginTop: 4,
            marginBottom: 4,
          },
        },
        total: {
          type: "Text",
          props: {
            text: "Total Due: $10,416.00",
            fontSize: 14,
            color: "#1a202c",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-4": { type: "Spacer", props: { height: 40 } },

        footer: {
          type: "Text",
          props: {
            text: "Payment is due within 30 days. Please make checks payable to Acme Corp or wire transfer to the account details provided separately.",
            fontSize: 9,
            color: "#a0aec0",
            align: "center",
            fontWeight: null,
            fontStyle: "italic",
            lineHeight: 1.4,
          },
        },
        "page-num": {
          type: "PageNumber",
          props: {
            format: null,
            fontSize: 8,
            color: "#cbd5e0",
            align: "center",
          },
        },
      },
    },
  },

  // =========================================================================
  // Report
  // =========================================================================
  {
    name: "report",
    label: "Quarterly Report",
    description:
      "A business report with summary data, tables, and key findings",
    spec: {
      root: "doc",
      elements: {
        doc: {
          type: "Document",
          props: {
            title: "Q4 2025 Report",
            author: "Analytics Team",
            subject: "Quarterly Performance",
          },
          children: ["page"],
        },
        page: {
          type: "Page",
          props: {
            size: "A4",
            orientation: null,
            marginTop: 50,
            marginBottom: 60,
            marginLeft: 50,
            marginRight: 50,
            backgroundColor: null,
          },
          children: [
            "title",
            "subtitle",
            "spacer-1",
            "summary-heading",
            "summary-text",
            "spacer-2",
            "metrics-table",
            "spacer-3",
            "findings-heading",
            "findings-list",
            "spacer-4",
            "divider-1",
            "recommendations-heading",
            "recommendations-text",
            "recommendations-list",
            "page-num",
          ],
        },

        title: {
          type: "Heading",
          props: {
            text: "Q4 2025 Performance Report",
            level: "h1",
            color: "#1a202c",
            align: "center",
          },
        },
        subtitle: {
          type: "Text",
          props: {
            text: "Analytics Division -- Prepared January 15, 2026",
            fontSize: 11,
            color: "#718096",
            align: "center",
            fontWeight: null,
            fontStyle: "italic",
            lineHeight: null,
          },
        },

        "spacer-1": { type: "Spacer", props: { height: 30 } },

        "summary-heading": {
          type: "Heading",
          props: {
            text: "Executive Summary",
            level: "h2",
            color: null,
            align: null,
          },
        },
        "summary-text": {
          type: "Text",
          props: {
            text: "Q4 2025 demonstrated strong growth across all key performance indicators. Revenue increased 23% year-over-year, driven primarily by enterprise client acquisitions and expansion of existing accounts. Customer retention remained above target at 94.2%, while new customer acquisition exceeded projections by 15%.",
            fontSize: 11,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.6,
          },
        },

        "spacer-2": { type: "Spacer", props: { height: 20 } },

        "metrics-table": {
          type: "Table",
          props: {
            columns: [
              { header: "Metric", width: "35%", align: null },
              { header: "Q3 2025", width: "20%", align: "right" },
              { header: "Q4 2025", width: "20%", align: "right" },
              { header: "Change", width: "25%", align: "right" },
            ],
            rows: [
              ["Revenue", "$4.2M", "$5.1M", "+21.4%"],
              ["New Customers", "142", "168", "+18.3%"],
              ["Customer Retention", "93.1%", "94.2%", "+1.1pp"],
              ["Avg. Deal Size", "$28,400", "$32,100", "+13.0%"],
              ["Support Tickets", "1,245", "1,089", "-12.5%"],
              ["NPS Score", "72", "78", "+6 pts"],
            ],
            headerBackgroundColor: "#3b82f6",
            headerTextColor: "#ffffff",
            borderColor: "#e2e8f0",
            fontSize: 10,
            striped: true,
          },
        },

        "spacer-3": { type: "Spacer", props: { height: 20 } },

        "findings-heading": {
          type: "Heading",
          props: {
            text: "Key Findings",
            level: "h2",
            color: null,
            align: null,
          },
        },
        "findings-list": {
          type: "List",
          props: {
            items: [
              "Enterprise segment grew 34%, accounting for 62% of total revenue",
              "Self-serve onboarding reduced time-to-value by 40%",
              "APAC region showed strongest growth at 45% QoQ",
              "Product usage increased 28% following the September feature release",
              "Customer support resolution time decreased from 4.2hrs to 2.8hrs",
            ],
            ordered: false,
            fontSize: 10,
            color: "#4a5568",
            spacing: 6,
          },
        },

        "spacer-4": { type: "Spacer", props: { height: 20 } },

        "divider-1": {
          type: "Divider",
          props: {
            color: "#e2e8f0",
            thickness: 1,
            marginTop: null,
            marginBottom: null,
          },
        },

        "recommendations-heading": {
          type: "Heading",
          props: {
            text: "Recommendations",
            level: "h2",
            color: null,
            align: null,
          },
        },
        "recommendations-text": {
          type: "Text",
          props: {
            text: "Based on Q4 performance data, we recommend the following strategic priorities for Q1 2026:",
            fontSize: 11,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.5,
          },
        },
        "recommendations-list": {
          type: "List",
          props: {
            items: [
              "Increase APAC sales team headcount by 30% to capitalize on regional momentum",
              "Invest in self-serve product analytics to further reduce onboarding friction",
              "Launch enterprise-tier support SLA to improve retention in top accounts",
              "Expand content marketing program targeting mid-market segment",
            ],
            ordered: true,
            fontSize: 10,
            color: "#4a5568",
            spacing: 6,
          },
        },

        "page-num": {
          type: "PageNumber",
          props: {
            format: "Page {pageNumber} of {totalPages}",
            fontSize: 9,
            color: "#a0aec0",
            align: "center",
          },
        },
      },
    },
  },

  // =========================================================================
  // Resume
  // =========================================================================
  {
    name: "resume",
    label: "Resume",
    description:
      "A professional resume with contact info, experience, education, and skills",
    spec: {
      root: "doc",
      elements: {
        doc: {
          type: "Document",
          props: {
            title: "Resume - Jane Cooper",
            author: "Jane Cooper",
            subject: null,
          },
          children: ["page"],
        },
        page: {
          type: "Page",
          props: {
            size: "LETTER",
            orientation: null,
            marginTop: 40,
            marginBottom: 40,
            marginLeft: 50,
            marginRight: 50,
            backgroundColor: null,
          },
          children: [
            "name",
            "title-text",
            "contact-row",
            "divider-top",
            "summary-heading",
            "summary-text",
            "divider-1",
            "experience-heading",
            "job-1-row",
            "job-1-desc",
            "job-1-highlights",
            "spacer-1",
            "job-2-row",
            "job-2-desc",
            "job-2-highlights",
            "divider-2",
            "education-heading",
            "edu-row",
            "divider-3",
            "skills-heading",
            "skills-row",
          ],
        },

        name: {
          type: "Heading",
          props: {
            text: "Jane Cooper",
            level: "h1",
            color: "#1a202c",
            align: "center",
          },
        },
        "title-text": {
          type: "Text",
          props: {
            text: "Senior Software Engineer",
            fontSize: 13,
            color: "#4a5568",
            align: "center",
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "contact-row": {
          type: "Row",
          props: {
            gap: 16,
            alignItems: null,
            justifyContent: "center",
            padding: 6,
            flex: null,
            wrap: null,
          },
          children: ["contact-email", "contact-phone", "contact-site"],
        },
        "contact-email": {
          type: "Link",
          props: {
            text: "jane@example.com",
            href: "mailto:jane@example.com",
            fontSize: 10,
            color: "#3b82f6",
          },
        },
        "contact-phone": {
          type: "Text",
          props: {
            text: "(555) 123-4567",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "contact-site": {
          type: "Link",
          props: {
            text: "janecooper.dev",
            href: "https://janecooper.dev",
            fontSize: 10,
            color: "#3b82f6",
          },
        },

        "divider-top": {
          type: "Divider",
          props: {
            color: "#2d3748",
            thickness: 2,
            marginTop: 8,
            marginBottom: 8,
          },
        },

        "summary-heading": {
          type: "Heading",
          props: {
            text: "Summary",
            level: "h3",
            color: "#2d3748",
            align: null,
          },
        },
        "summary-text": {
          type: "Text",
          props: {
            text: "Software engineer with 8+ years building high-performance web applications. Expertise in TypeScript, React, and distributed systems. Passionate about developer experience, accessibility, and mentoring engineering teams.",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.5,
          },
        },

        "divider-1": {
          type: "Divider",
          props: {
            color: "#e2e8f0",
            thickness: 1,
            marginTop: 10,
            marginBottom: 10,
          },
        },

        "experience-heading": {
          type: "Heading",
          props: {
            text: "Experience",
            level: "h3",
            color: "#2d3748",
            align: null,
          },
        },

        "job-1-row": {
          type: "Row",
          props: {
            gap: null,
            alignItems: null,
            justifyContent: "space-between",
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["job-1-title", "job-1-dates"],
        },
        "job-1-title": {
          type: "Text",
          props: {
            text: "Senior Software Engineer -- Vercel",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "job-1-dates": {
          type: "Text",
          props: {
            text: "2022 -- Present",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: "italic",
            lineHeight: null,
          },
        },
        "job-1-desc": {
          type: "Text",
          props: {
            text: "Led development of the Next.js deployment pipeline and developer tooling.",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "job-1-highlights": {
          type: "List",
          props: {
            items: [
              "Reduced build times by 45% through incremental compilation pipeline",
              "Designed and shipped real-time collaboration features used by 50K+ teams",
              "Mentored 4 junior engineers, 2 promoted to senior within 18 months",
            ],
            ordered: false,
            fontSize: 9,
            color: "#4a5568",
            spacing: 3,
          },
        },

        "spacer-1": { type: "Spacer", props: { height: 10 } },

        "job-2-row": {
          type: "Row",
          props: {
            gap: null,
            alignItems: null,
            justifyContent: "space-between",
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["job-2-title", "job-2-dates"],
        },
        "job-2-title": {
          type: "Text",
          props: {
            text: "Software Engineer -- Stripe",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "job-2-dates": {
          type: "Text",
          props: {
            text: "2018 -- 2022",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: "italic",
            lineHeight: null,
          },
        },
        "job-2-desc": {
          type: "Text",
          props: {
            text: "Full-stack development on the Payments Dashboard and Connect platform.",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "job-2-highlights": {
          type: "List",
          props: {
            items: [
              "Built the Connect Express onboarding flow, reducing merchant setup time by 60%",
              "Implemented real-time fraud detection UI processing 10M+ events/day",
              "Led migration from legacy REST APIs to GraphQL, improving data loading by 3x",
            ],
            ordered: false,
            fontSize: 9,
            color: "#4a5568",
            spacing: 3,
          },
        },

        "divider-2": {
          type: "Divider",
          props: {
            color: "#e2e8f0",
            thickness: 1,
            marginTop: 10,
            marginBottom: 10,
          },
        },

        "education-heading": {
          type: "Heading",
          props: {
            text: "Education",
            level: "h3",
            color: "#2d3748",
            align: null,
          },
        },
        "edu-row": {
          type: "Row",
          props: {
            gap: null,
            alignItems: null,
            justifyContent: "space-between",
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["edu-degree", "edu-year"],
        },
        "edu-degree": {
          type: "Text",
          props: {
            text: "B.S. Computer Science -- Stanford University",
            fontSize: 10,
            color: "#4a5568",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "edu-year": {
          type: "Text",
          props: {
            text: "2014 -- 2018",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: "italic",
            lineHeight: null,
          },
        },

        "divider-3": {
          type: "Divider",
          props: {
            color: "#e2e8f0",
            thickness: 1,
            marginTop: 10,
            marginBottom: 10,
          },
        },

        "skills-heading": {
          type: "Heading",
          props: { text: "Skills", level: "h3", color: "#2d3748", align: null },
        },
        "skills-row": {
          type: "Row",
          props: {
            gap: 20,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: null,
            wrap: true,
          },
          children: ["skills-langs", "skills-frameworks", "skills-infra"],
        },
        "skills-langs": {
          type: "Column",
          props: {
            gap: 2,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: 1,
          },
          children: ["skills-langs-label", "skills-langs-list"],
        },
        "skills-langs-label": {
          type: "Text",
          props: {
            text: "Languages",
            fontSize: 9,
            color: "#718096",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "skills-langs-list": {
          type: "Text",
          props: {
            text: "TypeScript, JavaScript, Python, Go, Rust, SQL",
            fontSize: 9,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.4,
          },
        },
        "skills-frameworks": {
          type: "Column",
          props: {
            gap: 2,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: 1,
          },
          children: ["skills-fw-label", "skills-fw-list"],
        },
        "skills-fw-label": {
          type: "Text",
          props: {
            text: "Frameworks",
            fontSize: 9,
            color: "#718096",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "skills-fw-list": {
          type: "Text",
          props: {
            text: "React, Next.js, Node.js, Express, GraphQL, Prisma",
            fontSize: 9,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.4,
          },
        },
        "skills-infra": {
          type: "Column",
          props: {
            gap: 2,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: 1,
          },
          children: ["skills-infra-label", "skills-infra-list"],
        },
        "skills-infra-label": {
          type: "Text",
          props: {
            text: "Infrastructure",
            fontSize: 9,
            color: "#718096",
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "skills-infra-list": {
          type: "Text",
          props: {
            text: "AWS, Vercel, Docker, Kubernetes, Terraform, PostgreSQL",
            fontSize: 9,
            color: "#4a5568",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.4,
          },
        },
      },
    },
  },

  // =========================================================================
  // Letter
  // =========================================================================
  {
    name: "letter",
    label: "Business Letter",
    description:
      "A formal business letter with letterhead, body paragraphs, and signature",
    spec: {
      root: "doc",
      elements: {
        doc: {
          type: "Document",
          props: {
            title: "Business Letter",
            author: "Acme Corp",
            subject: null,
          },
          children: ["page"],
        },
        page: {
          type: "Page",
          props: {
            size: "LETTER",
            orientation: null,
            marginTop: 60,
            marginBottom: 60,
            marginLeft: 70,
            marginRight: 70,
            backgroundColor: null,
          },
          children: [
            "letterhead",
            "divider-head",
            "spacer-1",
            "date",
            "spacer-2",
            "recipient",
            "spacer-3",
            "greeting",
            "spacer-4",
            "body-1",
            "spacer-5",
            "body-2",
            "spacer-6",
            "body-3",
            "spacer-7",
            "closing",
            "spacer-8",
            "signature",
            "sender-title",
            "page-num",
          ],
        },

        letterhead: {
          type: "Row",
          props: {
            gap: null,
            alignItems: "center",
            justifyContent: "space-between",
            padding: null,
            flex: null,
            wrap: null,
          },
          children: ["lh-company", "lh-contact"],
        },
        "lh-company": {
          type: "Heading",
          props: {
            text: "Acme Corp",
            level: "h2",
            color: "#2d3748",
            align: null,
          },
        },
        "lh-contact": {
          type: "Column",
          props: {
            gap: 2,
            alignItems: "flex-end",
            justifyContent: null,
            padding: null,
            flex: null,
          },
          children: ["lh-addr", "lh-phone", "lh-web"],
        },
        "lh-addr": {
          type: "Text",
          props: {
            text: "123 Business Ave, San Francisco, CA 94102",
            fontSize: 9,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "lh-phone": {
          type: "Text",
          props: {
            text: "(555) 987-6543",
            fontSize: 9,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "lh-web": {
          type: "Link",
          props: {
            text: "www.acmecorp.com",
            href: "https://acmecorp.com",
            fontSize: 9,
            color: "#3b82f6",
          },
        },

        "divider-head": {
          type: "Divider",
          props: {
            color: "#2d3748",
            thickness: 2,
            marginTop: 12,
            marginBottom: null,
          },
        },

        "spacer-1": { type: "Spacer", props: { height: 30 } },

        date: {
          type: "Text",
          props: {
            text: "February 19, 2026",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-2": { type: "Spacer", props: { height: 20 } },

        recipient: {
          type: "Column",
          props: {
            gap: 2,
            alignItems: null,
            justifyContent: null,
            padding: null,
            flex: null,
          },
          children: ["rcpt-name", "rcpt-title", "rcpt-company", "rcpt-addr"],
        },
        "rcpt-name": {
          type: "Text",
          props: {
            text: "Mr. John Smith",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "rcpt-title": {
          type: "Text",
          props: {
            text: "Director of Partnerships",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "rcpt-company": {
          type: "Text",
          props: {
            text: "Globex Corporation",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },
        "rcpt-addr": {
          type: "Text",
          props: {
            text: "456 Client Road, New York, NY 10001",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-3": { type: "Spacer", props: { height: 20 } },

        greeting: {
          type: "Text",
          props: {
            text: "Dear Mr. Smith,",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-4": { type: "Spacer", props: { height: 12 } },

        "body-1": {
          type: "Text",
          props: {
            text: "Thank you for taking the time to meet with our team last Thursday. We greatly enjoyed the conversation about potential collaboration opportunities between Acme Corp and Globex Corporation, and we are excited about the prospect of working together.",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.6,
          },
        },

        "spacer-5": { type: "Spacer", props: { height: 10 } },

        "body-2": {
          type: "Text",
          props: {
            text: "As discussed, we believe our enterprise platform can significantly streamline your operations while reducing costs by an estimated 25-30%. Our team has prepared a detailed proposal outlining the implementation timeline, resource requirements, and projected ROI. I have enclosed this document for your review.",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.6,
          },
        },

        "spacer-6": { type: "Spacer", props: { height: 10 } },

        "body-3": {
          type: "Text",
          props: {
            text: "We would welcome the opportunity to schedule a follow-up meeting to address any questions you may have and discuss next steps. Please do not hesitate to reach out at your convenience. We look forward to the possibility of a fruitful partnership.",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: 1.6,
          },
        },

        "spacer-7": { type: "Spacer", props: { height: 24 } },

        closing: {
          type: "Text",
          props: {
            text: "Sincerely,",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "spacer-8": { type: "Spacer", props: { height: 30 } },

        signature: {
          type: "Text",
          props: {
            text: "Sarah Johnson",
            fontSize: 11,
            color: null,
            align: null,
            fontWeight: "bold",
            fontStyle: null,
            lineHeight: null,
          },
        },
        "sender-title": {
          type: "Text",
          props: {
            text: "VP of Business Development, Acme Corp",
            fontSize: 10,
            color: "#718096",
            align: null,
            fontWeight: null,
            fontStyle: null,
            lineHeight: null,
          },
        },

        "page-num": {
          type: "PageNumber",
          props: {
            format: null,
            fontSize: 8,
            color: "#cbd5e0",
            align: "center",
          },
        },
      },
    },
  },
];
