# Email Results Feature Setup

This guide explains how to set up the email results feature for the Neuro-Feedback app.

## Overview

The email feature allows users to receive their session reports via email with PDF attachments. It supports two modes:

1. **Backend API Mode** (Recommended): Uses Resend email service via Vercel serverless function
2. **Mailto Fallback**: Opens the user's email client (does not actually send emails)

## Backend API Setup (Recommended)

### 1. Create a Resend Account

1. Go to [resend.com](https://resend.com) and create an account
2. Verify your domain or use their test domain
3. Get your API key from the dashboard

### 2. Configure Vercel Environment Variables

In your Vercel project settings, add these environment variables:

```
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=Neuro-Feedback <noreply@yourdomain.com>
```

**Note**: Replace `yourdomain.com` with your verified domain in Resend. If using Resend's test domain, use: `onboarding@resend.dev`

### 3. Enable Email Feature in Frontend

Create a `.env` file in the project root (or set in Vercel):

```
VITE_ENABLE_EMAIL_REPORTS=true
VITE_REPORTS_API_URL=/api/send-report
```

**Note**: The API URL defaults to `/api/send-report` if not specified, which works for Vercel deployments.

### 4. Deploy to Vercel

The `api/send-report.ts` file will automatically be deployed as a Vercel serverless function when you deploy your project.

## Mailto Fallback (No Setup Required)

If `VITE_ENABLE_EMAIL_REPORTS` is not set to `true`, the app will use the mailto fallback, which opens the user's email client. This works on iOS and desktop but requires the user to manually send the email.

## Testing

### Test Backend API Mode

1. Set `VITE_ENABLE_EMAIL_REPORTS=true` in your environment
2. Deploy to Vercel with `RESEND_API_KEY` configured
3. Complete a session and click "Export PDF Report"
4. Enter your email and click "Send training progress"
5. Check your inbox for the email with PDF attachment

### Test Mailto Fallback

1. Do NOT set `VITE_ENABLE_EMAIL_REPORTS` (or set it to `false`)
2. Complete a session and click "Export PDF Report"
3. Enter your email and click "Send training progress"
4. Your email client should open with a pre-filled message

## Debugging

The email feature includes comprehensive logging. Check the browser console for:

- `[EmailService]` - Frontend email service logs
- `[ShareProgress]` - UI component logs
- `[SessionSummary]` - PDF generation and email trigger logs

On the server side (Vercel logs), check for:

- `[API]` - Serverless function logs

## Troubleshooting

### "Email service not configured"

- Check that `RESEND_API_KEY` is set in Vercel environment variables
- Verify the API key is valid in Resend dashboard
- Ensure `VITE_ENABLE_EMAIL_REPORTS=true` is set

### "PDF is too large"

- PDFs larger than 10MB cannot be attached
- Users can download the PDF instead using "Download PDF instead" button

### Email not received

- Check Vercel function logs for errors
- Verify Resend API key is correct
- Check spam folder
- Verify `RESEND_FROM_EMAIL` is using a verified domain

### iOS/Bluefy Issues

- The mailto fallback works reliably on iOS
- For backend API, ensure the app is deployed (not just running locally)
- Check network connectivity

## File Structure

- `api/send-report.ts` - Vercel serverless function for sending emails
- `src/lib/email-service.ts` - Frontend email service logic
- `src/components/ShareProgress.tsx` - Email sharing UI component
- `src/components/SessionSummary.tsx` - PDF export and email trigger

## Dependencies

- `resend` - Email sending service
- `@vercel/node` - Vercel serverless function types

These are already added to `package.json` and will be installed with `npm install`.
