<!--
  app/pages/goodbye.vue — landing page after account deletion
  (W5-4 / Privacy + Compliance / ADR-0038).

  # What this page does
    - Public, unauthenticated route that the /profile/data deletion
      flow redirects to after the session is cleared.
    - Confirms the request was received and tells the user when their
      data will be hard-deleted.
-->
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Account deletion requested · Bulwark' })
</script>

<template>
  <div class="min-h-screen bg-background text-text-primary flex items-center justify-center px-6">
    <div class="max-w-md w-full bg-surface border border-border rounded-card p-8 shadow-sm">
      <h1 class="text-h1 font-semibold mb-4">You&rsquo;re signed out</h1>
      <p class="text-small text-text-secondary mb-4">
        We&rsquo;ve received your account deletion request. Your account
        is now disabled, and your personal data will be permanently
        deleted from our systems after a 30-day grace period.
      </p>
      <p class="text-small text-text-secondary mb-6">
        During the grace period, you can contact us to reverse the
        deletion. After that, the data cannot be recovered. Records
        we are legally required to retain (such as financial records
        and audit logs) will be kept for the periods described in our
        <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>,
        with your identifying information removed.
      </p>
      <NuxtLink
        to="/"
        class="inline-block rounded-input px-4 py-2 bg-primary text-white text-small"
      >
        Return home
      </NuxtLink>
    </div>
  </div>
</template>
