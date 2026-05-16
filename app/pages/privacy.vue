<!--
  app/pages/privacy.vue — Bulwark Privacy Policy (W5-4 / ADR-0038).

  # What this page does
    - Public, unauthenticated route (registered in
      app/middleware/auth.global.ts PUBLIC_ROUTES).
    - GDPR + CCPA-compliant disclosures: data categories, purposes,
      legal bases, sharing, retention, user rights, cookies, children,
      contact, changes.

  # Decisions (ADR-0008, ADR-0038)
    - Copy lives inline rather than in DB labels. Phase 2 can promote
      paragraphs into the CMS label registry; until then editing one
      paragraph is a 1-line code change, which is faster than seeding
      30 label rows.
    - Effective date is hard-coded to today (2026-05-16). Update the
      ISO date below when the policy changes; the changelog at the
      bottom retains prior dates.
    - We deliberately make NO claim of SOC2 certification. The DPA
      page states "SOC2 program in progress." Same wording here.
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Privacy Policy · Bulwark' })

const effectiveDate = '2026-05-16'
const supportEmail = 'privacy@bulwark.example'
</script>

<template>
  <div class="min-h-screen bg-background text-text-primary">
    <header class="border-b border-border bg-surface">
      <div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="font-semibold text-large">Bulwark</NuxtLink>
        <nav class="text-small">
          <NuxtLink to="/terms" class="mr-4 hover:underline">Terms</NuxtLink>
          <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-10 prose prose-sm">
      <h1 class="text-h1 font-semibold mb-2">Privacy Policy</h1>
      <p class="text-text-secondary text-small">Effective {{ effectiveDate }}</p>

      <section class="mt-8">
        <p>
          Bulwark (&quot;we&quot;, &quot;our&quot;) provides field-service
          management software for contractors, their subcontractors,
          and the homeowners they serve. This policy explains what
          personal data we collect, why we collect it, how we use it,
          and the choices you have. It applies to the Bulwark
          application and any service that links to this policy.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">1. Data we collect</h2>
        <ul class="list-disc pl-6">
          <li>
            <strong>Account data:</strong> name, email address,
            password hash, profile photo (optional), the organizations
            and roles you belong to, and your multi-factor
            authentication enrolment.
          </li>
          <li>
            <strong>Contact data:</strong> phone number when you (or an
            administrator) record it, and homeowner / contact records
            you create about other people in connection with a job.
          </li>
          <li>
            <strong>Property data:</strong> property addresses, photos,
            attachments, inspection responses, and the work-order /
            quote / invoice history attached to each property.
          </li>
          <li>
            <strong>Financial data:</strong> invoice line items,
            payment ledger entries, and payment-method metadata
            recorded by an administrator. Bulwark itself does not
            collect or store card numbers; any card processing is
            performed by the payment processor configured in your
            organization&rsquo;s settings.
          </li>
          <li>
            <strong>Usage &amp; security data:</strong> audit-log
            entries (who did what and when), authentication attempts
            (success / failure / lock-out), IP address of the request,
            and approximate device / user-agent information for
            security forensics.
          </li>
          <li>
            <strong>Device / network data:</strong> the standard set
            transmitted by your browser (IP, user-agent, accept
            headers, request timing) plus the technical metadata our
            structured logger records about each request.
          </li>
        </ul>
        <p>
          We do not knowingly collect special-category data
          (health, biometric, political, religious). We do not sell
          personal data, and we do not exchange it for monetary or
          other valuable consideration.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">2. How we use your data</h2>
        <ul class="list-disc pl-6">
          <li>To provide the Bulwark service to your organization.</li>
          <li>
            To communicate with you about your account (password
            resets, security alerts, work-order updates, invoices)
            using the channels you have enabled in
            <code>/profile/notifications</code>.
          </li>
          <li>
            To secure the service: detect abuse, enforce rate limits,
            investigate incidents, and audit configuration changes.
          </li>
          <li>
            To comply with legal obligations: respond to lawful
            requests, retain records required by tax, accounting, or
            consumer-protection law.
          </li>
          <li>
            To improve the product: aggregated, de-identified
            analytics about feature usage. We do not profile
            individual users and we do not employ third-party
            advertising trackers.
          </li>
        </ul>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">3. Legal bases (GDPR)</h2>
        <ul class="list-disc pl-6">
          <li>
            <strong>Contract</strong> (GDPR Art. 6(1)(b)) &mdash; processing
            necessary to deliver the service you (or your
            organization) signed up for.
          </li>
          <li>
            <strong>Legitimate interest</strong> (Art. 6(1)(f))
            &mdash; security monitoring, audit logging, fraud and
            abuse prevention, and analytics in support of product
            improvement.
          </li>
          <li>
            <strong>Consent</strong> (Art. 6(1)(a)) &mdash; optional
            marketing or product-update communications when you have
            opted in. You can withdraw consent at any time without
            affecting prior processing.
          </li>
          <li>
            <strong>Legal obligation</strong> (Art. 6(1)(c)) &mdash;
            retention of financial records and response to lawful
            government requests.
          </li>
        </ul>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">4. Who we share data with</h2>
        <p>
          We share personal data only with vendors and service
          providers acting as our processors under written contracts
          requiring confidentiality, security, and data-protection
          standards consistent with this policy. The current list of
          subprocessors is maintained by your organization
          administrator and is available on request.
        </p>
        <p class="text-text-secondary text-small">
          Subprocessor list: <em>TBD per environment.</em> Contact
          {{ supportEmail }} for the current list.
        </p>
        <p>
          We may share data when required by law, to defend our
          rights, or to investigate fraud. We may share aggregated,
          de-identified data without restriction.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">5. International transfers</h2>
        <p>
          Where personal data is transferred outside your jurisdiction
          (for example, EU / UK to the United States), we rely on the
          European Commission&rsquo;s Standard Contractual Clauses or
          an equivalent transfer mechanism with our subprocessors.
          <em>The specific hosting region for your organization is
          TBD per environment</em> and is disclosed on request.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">6. How long we keep your data</h2>
        <p>
          We retain personal data only as long as needed to deliver
          the service, comply with legal obligations, and protect
          against fraud. Detailed retention periods are published in
          our internal <em>Privacy &amp; Retention Policy</em>.
          Summary:
        </p>
        <ul class="list-disc pl-6">
          <li><strong>User accounts:</strong> until deletion request + 30-day grace period.</li>
          <li><strong>Property / work / financial records:</strong> 7 years.</li>
          <li><strong>Audit logs:</strong> 7 years (security &amp; legal forensics).</li>
          <li><strong>Sessions:</strong> 30 days.</li>
          <li><strong>Notifications:</strong> 90 days.</li>
          <li><strong>Search indexes &amp; analytics:</strong> 13 months.</li>
        </ul>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">7. Your rights</h2>
        <p>
          Depending on where you live, you have the following rights.
          We will respond to verifiable requests within the time
          frames required by applicable law (within 30 days for GDPR
          and within 45 days for CCPA, with a possible extension).
        </p>
        <ul class="list-disc pl-6">
          <li><strong>Access</strong> &mdash; a copy of your personal data (download via <code>/profile/data</code>).</li>
          <li><strong>Rectification</strong> &mdash; correct inaccurate data (via <code>/profile</code> or by request).</li>
          <li><strong>Erasure</strong> &mdash; delete your account (via <code>/profile/data</code>). We soft-delete immediately and hard-delete 30 days later, except where retention is required by law.</li>
          <li><strong>Portability</strong> &mdash; the same JSON export satisfies portability.</li>
          <li><strong>Restriction</strong> &mdash; ask us to limit processing in specific circumstances.</li>
          <li><strong>Objection</strong> &mdash; object to processing based on legitimate interest.</li>
          <li><strong>Withdraw consent</strong> &mdash; where processing relies on consent.</li>
          <li><strong>Lodge a complaint</strong> &mdash; with your local data-protection authority. EU residents can contact their national supervisory authority; UK residents the ICO; California residents the California Privacy Protection Agency.</li>
        </ul>
        <p>
          When you appear as an actor in another user&rsquo;s export
          (for example, an admin who approved a work order),
          your name and email are redacted to the placeholder
          <code>[user]</code> so we don&rsquo;t reveal one
          customer&rsquo;s data to another.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">8. Cookies</h2>
        <p>
          Phase 1 of Bulwark uses <strong>first-party essential
          session cookies only</strong> (the authenticated session
          cookie issued by our auth subsystem). We do <em>not</em>
          set third-party analytics, advertising, or tracking
          cookies in Phase 1. As essential cookies are exempt from
          the GDPR / ePrivacy consent requirement, we do not
          surface a cookie banner. If we add non-essential cookies
          in a later release, we will introduce a consent banner
          and update this policy.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">9. Children</h2>
        <p>
          Bulwark is intended for use by businesses and homeowners
          aged 16 and over. We do not knowingly collect personal data
          from anyone under 16. If you believe a minor has provided
          data to Bulwark, contact us at {{ supportEmail }} and we
          will delete it.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">10. Security</h2>
        <p>
          We maintain administrative, technical, and physical
          safeguards to protect personal data, including encryption
          in transit, strong password hashing, opaque session tokens,
          rate limiting, audit logging, and a structured-logger PII
          redaction pass. Our SOC2 program is in progress; we do not
          claim certification at this time.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">11. Changes</h2>
        <p>
          We may update this policy from time to time. Material
          changes are communicated by in-app notice or email. The
          effective date at the top of the page reflects the most
          recent revision.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">12. Contact us</h2>
        <p>
          Questions, complaints, or requests can be sent to
          <a :href="`mailto:${supportEmail}`" class="text-primary underline">{{ supportEmail }}</a>.
        </p>
      </section>
    </main>

    <footer class="border-t border-border bg-surface mt-10">
      <div class="max-w-3xl mx-auto px-6 py-4 text-small text-text-secondary">
        © {{ new Date().getFullYear() }} Bulwark.
        <NuxtLink to="/terms" class="hover:underline">Terms</NuxtLink>
        ·
        <NuxtLink to="/dpa" class="hover:underline">DPA</NuxtLink>
      </div>
    </footer>
  </div>
</template>
