<!--
  app/pages/terms.vue — Bulwark Terms of Service (W5-4 / ADR-0038).

  # What this page does
    - Public, unauthenticated route. Standard SaaS ToS skeleton —
      services description, eligibility, accounts, acceptable use,
      IP, fees, termination, disclaimers, liability cap,
      indemnification, governing law (TBD), changes.

  # Decisions (ADR-0008, ADR-0038)
    - Copy is conservative and includes explicit "TBD" markers where
      jurisdiction-specific values must be filled in before public
      launch (governing law, dispute resolution, contact entity).
      Counsel should review before GA.
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Terms of Service · Bulwark' })

const effectiveDate = '2026-05-16'
const supportEmail = 'legal@bulwark.example'
</script>

<template>
  <div class="min-h-screen bg-background text-text-primary">
    <header class="border-b border-border bg-surface">
      <div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="font-semibold text-large">Bulwark</NuxtLink>
        <nav class="text-small">
          <NuxtLink to="/privacy" class="mr-4 hover:underline">Privacy</NuxtLink>
          <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-10 prose prose-sm">
      <h1 class="text-h1 font-semibold mb-2">Terms of Service</h1>
      <p class="text-text-secondary text-small">Effective {{ effectiveDate }}</p>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">1. The Service</h2>
        <p>
          Bulwark provides web-based field-service management
          software including property records, inspections, quotes,
          work orders, invoices, payment ledgers, subcontractor and
          homeowner portals, audit logging, and related features
          (the &quot;Service&quot;). The Service is delivered as
          software-as-a-service to organizations and the users they
          authorize.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">2. Eligibility</h2>
        <p>
          You must be at least 16 years old and capable of forming a
          binding contract to use the Service. If you use the Service
          on behalf of an organization, you represent that you have
          authority to bind that organization to these Terms.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">3. Accounts</h2>
        <p>
          You are responsible for maintaining the confidentiality of
          your credentials and for all activity on your account.
          Notify us immediately of any unauthorized access. We may
          suspend or terminate accounts that violate these Terms or
          create security risk.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">4. Acceptable use</h2>
        <ul class="list-disc pl-6">
          <li>No unlawful, infringing, or harmful content.</li>
          <li>No reverse engineering, scraping, or load testing without permission.</li>
          <li>No use that interferes with or disrupts the Service.</li>
          <li>No use to send unsolicited bulk messaging.</li>
          <li>No upload of malware or attempt to circumvent access controls.</li>
        </ul>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">5. Intellectual property</h2>
        <p>
          The Service, including all software, design, and trademarks,
          remains the property of Bulwark and its licensors. You
          retain ownership of your data and grant Bulwark a limited
          license to host, process, and display that data solely as
          needed to provide the Service.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">6. Fees</h2>
        <p>
          Fees, billing terms, and renewals are set out in your
          organization&rsquo;s order form or subscription plan.
          Unpaid fees may result in suspension. All fees are
          non-refundable except as required by law.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">7. Termination</h2>
        <p>
          Either party may terminate for material breach if the
          breach remains uncured for 30 days after written notice.
          You may request account deletion at any time via
          <code>/profile/data</code>; see the Privacy Policy for the
          retention schedule that applies after deletion.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">8. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE.&quot; BULWARK DISCLAIMS ALL WARRANTIES, EXPRESS
          OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE FULLEST
          EXTENT PERMITTED BY LAW.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">9. Limitation of liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, BULWARK&rsquo;S
          AGGREGATE LIABILITY UNDER THESE TERMS WILL NOT EXCEED THE
          FEES PAID OR PAYABLE BY YOUR ORGANIZATION FOR THE SERVICE
          IN THE 12 MONTHS PRECEDING THE EVENT GIVING RISE TO THE
          CLAIM. BULWARK WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">10. Indemnification</h2>
        <p>
          You will defend, indemnify, and hold harmless Bulwark from
          any third-party claim arising out of your breach of these
          Terms, your data, or your use of the Service in violation
          of applicable law.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">11. Governing law</h2>
        <p>
          These Terms are governed by the laws of <em>TBD</em>,
          without regard to conflict-of-laws principles. Any dispute
          will be resolved in the courts of <em>TBD</em>, except
          where applicable consumer-protection law grants you the
          right to bring an action in the courts of your residence.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">12. Changes</h2>
        <p>
          We may update these Terms from time to time. Material
          changes are communicated by in-app notice or email. Your
          continued use of the Service after the effective date of
          revised Terms constitutes acceptance.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">13. Contact</h2>
        <p>
          Questions about these Terms can be sent to
          <a :href="`mailto:${supportEmail}`" class="text-primary underline">{{ supportEmail }}</a>.
        </p>
      </section>
    </main>

    <footer class="border-t border-border bg-surface mt-10">
      <div class="max-w-3xl mx-auto px-6 py-4 text-small text-text-secondary">
        © {{ new Date().getFullYear() }} Bulwark.
        <NuxtLink to="/privacy" class="hover:underline">Privacy</NuxtLink>
        ·
        <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
      </div>
    </footer>
  </div>
</template>
