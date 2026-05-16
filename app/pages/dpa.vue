<!--
  app/pages/dpa.vue — Bulwark Data Processing Addendum (W5-4 / ADR-0038).

  # What this page does
    - Public-route stub of a GDPR Art. 28 DPA for B2B customers. Sets
      out the controller / processor split, subprocessor list (TBD),
      security measures (SOC2 program in progress), breach
      notification (72 hours), audit rights (annual), term, and
      termination.

  # Decisions (ADR-0008, ADR-0038)
    - This is a stub, not a signed contract. Customers requiring a
      counter-signed DPA must contact legal@bulwark.example for an
      execution copy. The page exists so we can link from sales /
      onboarding flows without writing one-off PDFs.
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Data Processing Addendum · Bulwark' })

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
          <NuxtLink to="/terms" class="hover:underline">Terms</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-10 prose prose-sm">
      <h1 class="text-h1 font-semibold mb-2">Data Processing Addendum</h1>
      <p class="text-text-secondary text-small">Effective {{ effectiveDate }}</p>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">1. Roles</h2>
        <p>
          For personal data processed by Bulwark on behalf of your
          organization, your organization is the <strong>data
          controller</strong> and Bulwark is the <strong>data
          processor</strong> within the meaning of GDPR Art. 4 and
          equivalent provisions of UK GDPR and the CCPA / CPRA
          (where Bulwark acts as a &quot;service provider&quot;).
          This Addendum supplements the Terms of Service and applies
          to personal data Bulwark processes on the
          controller&rsquo;s behalf.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">2. Scope and instructions</h2>
        <p>
          Bulwark processes personal data only on documented
          instructions from the controller and only for the purpose
          of providing the Service. The categories of data subjects
          and personal data are described in the Privacy Policy at
          <NuxtLink to="/privacy" class="text-primary underline">/privacy</NuxtLink>.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">3. Subprocessors</h2>
        <p>
          The controller authorizes Bulwark to engage subprocessors
          for hosting, email delivery, error monitoring, and similar
          ancillary services. Each subprocessor is bound by written
          contract to data-protection obligations no less stringent
          than those in this Addendum.
        </p>
        <p class="text-text-secondary text-small">
          Current subprocessor list: <em>TBD per environment.</em>
          Contact {{ supportEmail }} for the current list and to
          receive prior written notice of additions.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">4. Security measures</h2>
        <p>
          Bulwark implements technical and organizational measures
          appropriate to the risk, including encryption of personal
          data in transit, strong password hashing, opaque session
          tokens, multi-factor authentication, rate limiting,
          append-only audit logging, structured-logger PII
          redaction, least-privilege access controls, and routine
          backups with documented restore procedures. Bulwark&rsquo;s
          SOC2 program is in progress; certification is anticipated
          but not yet attested. The full description of measures is
          available on request.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">5. Personnel</h2>
        <p>
          Personnel authorized to process personal data are bound by
          written confidentiality obligations and receive periodic
          data-protection training.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">6. International transfers</h2>
        <p>
          For transfers of EU / UK personal data outside the EEA or
          the UK, Bulwark relies on the European Commission&rsquo;s
          Standard Contractual Clauses (incorporated by reference)
          or an equivalent transfer mechanism, with each
          subprocessor subject to the same.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">7. Data subject requests</h2>
        <p>
          Bulwark provides controllers with the in-app tooling to
          satisfy data-subject access, rectification, and erasure
          requests (the <code>/profile/data</code> surface and the
          admin user-management surface). Where a request cannot be
          satisfied via self-service, Bulwark will assist the
          controller within a reasonable timeframe and at the
          controller&rsquo;s expense.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">8. Breach notification</h2>
        <p>
          Bulwark will notify the controller without undue delay,
          and in any event within <strong>72 hours</strong>, of
          becoming aware of a personal-data breach affecting the
          controller&rsquo;s data. The notice will describe the
          nature of the breach, the categories and approximate
          number of data subjects and records affected, the likely
          consequences, and the measures taken or proposed to
          address it.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">9. Audits</h2>
        <p>
          On reasonable prior notice, controllers may audit
          Bulwark&rsquo;s compliance with this Addendum no more than
          <strong>once per calendar year</strong>, except where a
          regulator requires additional audits or where a prior
          incident reasonably justifies one. Audits are conducted
          during business hours, subject to confidentiality, and at
          the controller&rsquo;s expense.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">10. Term and termination</h2>
        <p>
          This Addendum is effective for the duration of the
          underlying subscription to the Service and terminates with
          it. On termination, Bulwark will, at the controller&rsquo;s
          choice, return or delete personal data in its possession,
          except where retention is required by law.
        </p>
      </section>

      <section class="mt-8">
        <h2 class="text-h2 font-semibold">11. Contact</h2>
        <p>
          To request a counter-signed copy of this Addendum or for
          DPA-specific questions, contact
          <a :href="`mailto:${supportEmail}`" class="text-primary underline">{{ supportEmail }}</a>.
        </p>
      </section>
    </main>

    <footer class="border-t border-border bg-surface mt-10">
      <div class="max-w-3xl mx-auto px-6 py-4 text-small text-text-secondary">
        © {{ new Date().getFullYear() }} Bulwark.
        <NuxtLink to="/privacy" class="hover:underline">Privacy</NuxtLink>
        ·
        <NuxtLink to="/terms" class="hover:underline">Terms</NuxtLink>
      </div>
    </footer>
  </div>
</template>
