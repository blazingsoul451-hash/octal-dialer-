---
name: technical-seo-and-cwv-guard
description: Technical SEO standards, JSON-LD schemas (SoftwareApplication, FAQPage, Organization), semantic HTML5 landmarks, OpenGraph cards, and Core Web Vitals budgets (CLS=0, LCP<1.5s, INP<100ms).
---

# Technical SEO and Core Web Vitals Guard

High-performance web applications must balance heavy visual craft with strict technical SEO landmarks and Google Core Web Vitals (CWV) budgets. This skill codifies semantic structuring, structured schema injection, and CWV optimization rules.

---

## 1. Core Web Vitals (CWV) Performance Budgets

| Metric | Target Budget | Root Cause of Failure | Mandatory Prevention |
|---|---|---|---|
| **Cumulative Layout Shift (CLS)** | **`0.00`** | Unsized images, late-loading web fonts, dynamic ads | Reserve explicit `aspect-ratio` or `min-h-[...]` on all media/hero containers |
| **Largest Contentful Paint (LCP)** | **`< 1.5s`** | Giant hero images, heavy client-side bundles | Preload hero fonts (`font-display: swap`), modern WebP/AVIF images with `fetchpriority="high"` |
| **Interaction to Next Paint (INP)** | **`< 100ms`** | Long-running JavaScript tasks on main thread | Chunk complex computations via `scheduler.yield()` or Web Workers, debounce event listeners |

---

## 2. Semantic HTML5 Landmark Hierarchy

Never build a landing page out of nested, unsemantic `<div>` elements. Screen readers and search engine crawlers rely on strict landmarks:

```tsx
export const SemanticPageLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col min-h-screen">
    {/* Landmark 1: Header / Navigation */}
    <header role="banner" className="sticky top-0 z-50 w-full border-b border-[#18181b] bg-[#09090b]/80 backdrop-blur-md">
      <nav aria-label="Main Navigation" className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Navigation Links */}
      </nav>
    </header>

    {/* Landmark 2: Main Document Body */}
    <main id="main-content" role="main" className="flex-1">
      {/* Exactly ONE <h1> tag per page */}
      <section aria-labelledby="hero-heading">
        <h1 id="hero-heading">Octal Dialer: Autonomous Cellular Outreach</h1>
      </section>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading">Real Dual-SIM Cellular Hardware</h2>
      </section>
    </main>

    {/* Landmark 3: Footer */}
    <footer role="contentinfo" className="border-t border-[#18181b] bg-[#09090b] py-12">
      {/* Footer Links & Legal */}
    </footer>
  </div>
);
```

---

## 3. JSON-LD Structured Data Injection

Inject valid Schema.org metadata in `<head>` to qualify for Google rich search results:

```tsx
export const StructuredDataHead = () => {
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Octal Dialer',
    operatingSystem: 'Android, Web, Desktop',
    applicationCategory: 'BusinessApplication',
    offers: {
      '@type': 'Offer',
      price: '49.00',
      priceCurrency: 'USD',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '128',
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does Octal Dialer bypass VoIP spam detection?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Octal Dialer pairs with genuine Android Dual-SIM hardware to route calls over physical GSM carrier towers, preserving authentic subscriber attestation.',
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
};
```

---

## 4. OpenGraph and Social Card Metadata Standard

Ensure high-converting preview cards across Slack, X/Twitter, and LinkedIn:

```html
<meta name="title" content="Octal Dialer — Autonomous Cellular Telephony SaaS" />
<meta name="description" content="Eliminate VoIP spam flags with real Android Dual-SIM GSM telephony, AI voice pipelines, and multi-tenant CRM automation." />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://zestify7.online/" />
<meta property="og:title" content="Octal Dialer — Autonomous Cellular Telephony SaaS" />
<meta property="og:description" content="Physical GSM telephony with sub-120ms carrier handshakes." />
<meta property="og:image" content="https://zestify7.online/assets/og-card-1200x630.png" />

<!-- Twitter / X -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:site" content="@OctalDialer" />
<meta property="twitter:image" content="https://zestify7.online/assets/og-card-1200x630.png" />
```

---

## 5. Layout Shift (CLS) Zero-Drift Checklist

- [ ] All images declare explicit `width` and `height` or use `aspect-video` / `aspect-square`.
- [ ] Font files use `font-display: swap` with preloaded woff2 files.
- [ ] Skeleton loaders match the exact bounding box of the incoming data cards.
- [ ] Modals and drawers use `fixed` positioning, never pushing content down the page.
