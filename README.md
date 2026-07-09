# ReKnock

Automated quote follow-up for residential trades. getreknock.com

## Run locally
    npm install
    npm run dev        # http://localhost:3000

## Deploy
Push this repo to GitHub, import into Vercel (zero config), add getreknock.com in Vercel domain settings.

## Before launch checklist
- [ ] Replace TALLY_FORM_URL in app/signup/page.tsx with a real form link
- [ ] Set up hello@getreknock.com (or change the email in signup + privacy pages)
- [ ] Landing page live BEFORE submitting the Twilio 10DLC campaign (review checks the URL)

## What's in here
- app/               landing page, /signup placeholder, /privacy policy
- CLAUDE.md          full product spec + build rules for Claude Code (app phases 1-5)
- schema.sql         Postgres schema for the app (not used by landing page yet)
- docs/              sequence templates + landing copy source
