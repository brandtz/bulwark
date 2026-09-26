# Production User Access

Production users are stored in Bulwark's application database. Vercel hosts the app; its dashboard is not the user-management tool.

## Sign in

1. Open <https://bulwark-chi.vercel.app/login>.
2. Sign in with the email and password for an existing production account. Local demo accounts and the local demo password do not work in production.
3. If you have forgotten your password, choose **Forgot password?** and request a reset link. The email flow requires an active email provider for the organization and `BULWARK_APP_URL=https://bulwark-chi.vercel.app` in the Vercel production environment.

You need an active `org_admin` or `super_admin` account to manage users. If you do not have one, ask the current organization or platform administrator to grant access. Do not attempt to promote yourself or use local demo credentials.

## View and manage users

1. After signing in as an administrator, open **Settings → Users & roles**, or visit <https://bulwark-chi.vercel.app/settings/users>.
2. The list shows members and outstanding invitations for your currently selected organization.
3. For existing members, use the role selector or the suspend/reactivate/deactivate controls. This screen does not edit a member's email address or name; those changes need the account/profile workflow or an authorized support/database operator.

## Invite a user

1. In **Settings → Users & roles**, choose **Invite user**.
2. Enter the person's email and choose the least-privileged role they need, then send the invitation.
3. Bulwark emails the invitation when that organization's email provider is configured. The link expires after seven days.
4. If email is unavailable, the result panel says so and displays a copyable invitation link. Send that link to the intended recipient over a trusted channel. The invited person opens it, sets their name and password, and the account becomes active when they accept.

To configure email, an administrator can open **Settings → Providers** (`/settings/providers`) for the organization and configure its Resend provider, including a verified sender address. Set `BULWARK_APP_URL` in Vercel to the canonical production origin and redeploy after changing environment variables. Never paste API keys into a ticket or chat.

## Limits

The UI can change a member's organization role and access status, and can create, resend, or revoke invitations. It does not let an administrator set another person's password or create an active account without the invitee accepting an invitation. Use the supported invite/reset flows rather than editing production database rows directly.