# Cookie Care: Product Document

## 1. The What: Holistic Compliance Analysis Engine

**Cookie Care** is an enterprise-grade web application designed to provide a 360-degree view of a website's digital compliance and security posture. It is not just a scanner; it is an intelligent analysis engine that empowers businesses to proactively identify and mitigate privacy risks.

The application is built on three core pillars:

1.  **Cookie Scanner:** Delivers real-time, in-depth reports on website cookies, network trackers, and consent banner effectiveness. It goes beyond simple detection to analyze compliance against regulations like GDPR and CCPA using a unique, multi-stage scanning methodology.
2.  **Legal Reviewer:** An AI-powered legal assistant that analyzes complex legal documents like Data Processing Agreements (DPAs). It features document analysis, from-scratch contract generation, a template library, and an interactive AI chat for editing and querying documents.
3.  **Vulnerability Scanner:** A non-intrusive security tool that performs a passive scan of a website's front end. It analyzes HTTP headers and page source to identify common security misconfigurations and vulnerabilities, providing a risk score and clear remediation plans.

## 2. The Why: The Need for Intelligent Compliance

In today's digital landscape, businesses face a complex and ever-evolving web of regulations. Non-compliance with laws like GDPR and CCPA can lead to severe financial penalties, operational disruption, and significant reputational damage.

**Current Market Pain Points:**
*   **Surface-Level Scanning:** Existing tools often perform a simple, one-time scan, failing to capture the dynamic nature of modern websites. They miss critical violations that occur before a user gives consent or after they reject it.
*   **Information Overload:** Reports from traditional scanners are often just long, uncontextualized lists of cookies, leaving it up to the user to figure out the actual risk.
*   **Siloed Solutions:** Businesses are forced to use separate tools for cookie compliance, legal document review, and security scanning. This is inefficient, costly, and provides a fragmented view of their overall risk profile.
*   **Lack of Actionable Insight:** Standard tools can tell you *what* is on your site, but they struggle to explain *why* it's a problem and *how* to fix it in a practical way.

**Cookie Care's Solution:**
Cookie Care was built to address these gaps by providing a single, integrated platform that offers:
*   **Depth:** Our unique three-stage scanning process simulates real user interaction to find violations that other tools miss.
*   **Intelligence:** We leverage the advanced reasoning and structured data generation capabilities of the Google Gemini API to transform raw data into a clear, contextual, and actionable compliance report.
*   **Holistic View:** By combining privacy, legal, and security analysis, we give organizations a complete and unified understanding of their digital compliance posture.

## 3. The How: Detailed Technical Architecture

Cookie Care is architected as a modern, decoupled web application, consisting of a lightweight frontend, a powerful Node.js backend, and the Google Gemini API for its core intelligence.

### 3.1. Tech Stack

| Component           | Technology                                                                | Purpose                                                                          |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Frontend**        | React, TypeScript, Tailwind CSS (via CDN), Recharts, jspdf, html2canvas, mammoth.js, diff | Renders a dynamic UI, manages state, visualizes data, and handles client-side document processing and report generation. |
| **Backend**         | Node.js, Express, TypeScript                                              | Serves the API, orchestrates scans, manages real-time communication, and interfaces with the Gemini API. |
| **Scanning Engine** | Puppeteer                                                                 | A headless Chrome library used to automate website crawling, interaction, and data collection. |
| **AI Engine**       | Google Gemini API (`gemini-2.5-flash` model)                              | Provides the core intelligence for data analysis, content generation, and structured insight extraction. |
| **Email Service**   | Nodemailer                                                                | Handles the delivery of PDF reports, with support for both SMTP and Ethereal for development. |

### 3.2. Frontend Architecture

The frontend is a single-page application (SPA) built with React and TypeScript, designed for performance and interactivity.

*   **Structure:** The application is mounted via `index.tsx` into `index.html`. The main `App.tsx` component serves as the root, managing the overall layout and switching between the three main views (`CookieScannerView`, `LegalReviewerView`, `VulnerabilityScannerView`) using React state.
*   **Styling:** For simplicity and rapid development, Tailwind CSS is loaded via a CDN. A custom theme is configured directly in `index.html`. Global styles, including a dark mode implementation using CSS variables, are also defined in a `<style>` tag, removing the need for a CSS build step.
*   **State Management:** State is managed locally within components using React Hooks (`useState`, `useCallback`, `useEffect`). There is no global state manager like Redux, as the application's state is largely tied to individual scan/review sessions.
*   **Asynchronous Communication:** The frontend communicates with the backend via the Fetch API. The Cookie Scanner leverages **Server-Sent Events (SSE)** via the `EventSource` API to receive a real-time stream of logs and the final result from the backend, providing a responsive user experience during long scans.
*   **Client-Side Processing:**
    *   **PDF Generation:** `jspdf` and `html2canvas` work together to capture rendered React components, compose them into a multi-page PDF document, and initiate a client-side download.
    *   **CSV Generation:** Raw JSON data from scan results is converted into CSV format directly in the browser, offering a lightweight export option.
    *   **`.docx` Parsing:** The `mammoth` library is used in the `LegalReviewerView` to parse `.docx` files into raw text directly in the browser, ensuring user documents are not unnecessarily stored on the server before analysis.
    *   **Text Comparison:** The `diff` library is used in the `LegalAnalysisDisplay` to create a visual "diff" view of document changes suggested by the AI assistant.

### 3.3. Backend Architecture

The backend is a robust Node.js application using Express.js, built with TypeScript for type safety and scalability.

*   **API Server:** An Express server handles all API requests. It uses `cors` to allow cross-origin requests from the frontend and `express.json` (with an increased 50mb limit) to handle large payloads, such as base64-encoded PDFs for the email service.
*   **Environment Management:** The `dotenv` library manages environment variables, critically the `API_KEY` for the Gemini API and optional `SMTP_*` credentials for Nodemailer.
*   **Error Handling:** Each endpoint is wrapped in a `try...catch` block to handle errors gracefully and return meaningful error messages to the client. A global `finally` block in scan operations ensures the Puppeteer browser instance is always closed to prevent resource leaks.
*   **Modularity:** While the main logic resides in `server.ts`, types are shared between the frontend and backend via separate `types.ts` files, and a `cookieDatabase.ts` provides a static data source.

### 3.4. Core Feature Implementation: A Deep Dive

#### A. Cookie Scanner (`/api/scan`)

This is the most complex feature, combining web crawling, browser automation, and AI analysis.

1.  **Request & SSE Setup:** The frontend initiates a connection to the `/api/scan` endpoint. The backend establishes a Server-Sent Events (SSE) connection, keeping it open to stream progress updates.
2.  **Puppeteer Initialization:** A new, isolated Puppeteer browser context is created for each scan. This simulates a "first-time visit" and prevents cross-scan contamination. The user agent and viewport are set to mimic a standard desktop user.
3.  **Intelligent Crawling Strategy:**
    *   **Sitemap Discovery:** The crawler first attempts to find a sitemap by checking `/robots.txt` and falling back to the common `/sitemap.xml` location. If found, all URLs from the sitemap are added to the crawl queue with high priority, ensuring comprehensive coverage.
    *   **Link Discovery & Prioritization:** On each page, the crawler extracts all internal links. Links containing keywords like "privacy," "terms," or "legal" are prioritized to ensure critical compliance pages are scanned.
    *   **Crawl Diversity (Bucketing):** To prevent the crawler from getting stuck in one section of a large site (e.g., a blog with thousands of pages), it uses a "bucketing" system. It limits the number of pages it visits from any single top-level directory (e.g., `/blog/`, `/products/`), ensuring a more diverse and representative sample of the entire website.
4.  **The Three-Stage Consent Simulation:** This is the core differentiator. The process occurs on the initial entry page:
    *   **Stage 1 (Pre-Consent):** The page is loaded, and a "soak time" is observed to allow delayed scripts to fire. All cookies, network requests, and storage items are captured *before* any consent action is taken. A screenshot is taken.
    *   **Stage 2 (Post-Rejection):** The page is reloaded. The backend programmatically searches for and clicks buttons with text like "Reject All" or "Necessary Only." A new snapshot of all tracking technologies is then captured.
    *   **Stage 3 (Post-Acceptance):** The page is reloaded again. This time, "Accept All" buttons are clicked, and a final snapshot is taken to represent the fully consented state.
5.  **Multi-Source Data Collection:**
    *   **Cookies:** The backend uses the Chrome DevTools Protocol (CDP) via `cdpSession.send('Network.getAllCookies')` for the most comprehensive cookie collection, falling back to `page.cookies()` if needed.
    *   **Network Requests:** Puppeteer's network interception (`page.on('request', ...)`) is used to log all outgoing third-party requests.
    *   **DOM & Storage:** `page.evaluate()` is used to execute JavaScript in the browser context, allowing the backend to collect Local/Session Storage items and detect the presence of a consent banner, cookie policy link, Google Consent Mode v2 signals, and common CMP providers.
6.  **AI-Powered Analysis & Categorization:**
    *   **Batching:** All unique collected items (cookies, requests, storage) are batched (25 items per batch) to avoid overwhelming the Gemini API with a single massive request.
    *   **Structured Prompting:** For each batch, a highly detailed, rule-based prompt is sent to the Gemini API. This prompt instructs the AI to act as a "rule-based web technology categorization engine" and follow strict logic to determine `category` (Necessary, Analytics, etc.), `complianceStatus` (based on which stage it appeared in), `isTracker`, `purpose`, and a specific `remediation` plan.
    *   **JSON Schema Enforcement:** The `responseSchema` configuration is used in the Gemini API call. This forces the model to return a valid JSON object that matches a predefined structure, eliminating the need for fragile string parsing and ensuring reliable data.
    *   **Retry Logic:** The AI analysis function includes a retry loop with exponential backoff to handle transient API errors.
7.  **Final Aggregation & Response:**
    *   **Compliance Score:** A final, separate call is made to Gemini, providing it with a summary of the findings (e.g., number of pre-consent issues). The AI is asked to generate a final GDPR/CCPA risk assessment (`riskLevel` and `assessment`).
    *   **Data Merging:** The AI's analysis is merged with data collected by Puppeteer (e.g., cookie expiry, party) and data from the local `cookieDatabase.ts`. A final, comprehensive JSON payload is constructed.
    *   **SSE Completion:** This final JSON object is sent to the frontend via the open SSE connection, and the connection is then closed.

#### B. Legal & Vulnerability Scanners

These modules follow a similar pattern of data collection followed by AI analysis but are tailored to their specific tasks.

*   **Vulnerability Scanner (`/api/scan-vulnerabilities`):**
    1.  **Passive Collection:** Puppeteer visits the URL once to collect HTTP response headers and the rendered HTML source. It extracts comments, meta tags, external scripts, and form attributes.
    2.  **AI Security Audit:** All this passive intelligence is sent to Gemini. The prompt instructs the AI to act as a "Principal Security Consultant" and perform an audit against a detailed checklist (CSP, HSTS, cookie security, etc.). The `responseSchema` enforces a strict report structure, including an overall risk score, summary, and a detailed array of findings.

*   **Legal Reviewer Suite:**
    1.  **Analysis (`/api/analyze-legal-document`):** The user's document text and chosen "perspective" are sent to Gemini. The prompt guides the AI to perform a clause-by-clause risk analysis from that perspective, returning a structured JSON report.
    2.  **Generation (`/api/generate-contract`):** User-provided details (and an optional template from the in-memory library) are sent to Gemini. The prompt instructs the AI to act as a legal drafter and return a complete contract formatted with specific HTML tags (`<h2>`, `<p>`, `<strong>`).
    3.  **Interactive Chat (`/api/chat-with-document`):** This endpoint powers the document editor. It sends the current document text and the user's query (e.g., "rephrase this clause") to Gemini. The prompt is engineered to make the AI differentiate between a question and an edit command. It returns JSON containing either an `answer` (for questions) or both an `answer` (confirmation message) and the `revisedText` (the full, edited document).

#### C. Supporting Services

*   **Email Reporting (`/api/email-report`):** This endpoint is a micro-service within the application. It receives a base64-encoded PDF and an email address. It first uses Gemini to generate a professional, context-aware HTML email body. Then, it uses Nodemailer to send the email with the PDF as an attachment. It is configured to use a real SMTP server if credentials are provided in `.env`, otherwise it safely falls back to a temporary Ethereal.email inbox for development and testing.
