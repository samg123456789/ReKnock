# ReKnock

ReKnock is a quote follow-up product for residential contractors. It helps a contractor stay in touch after sending an estimate, then hands the conversation back the moment a homeowner replies.

This repository is also a public product and systems case study. The application source is intentionally kept private; the material below explains the product thinking, customer experience, and engineering decisions without exposing credentials, customer data, or proprietary implementation details.

## Start with the case study

- [Product case study](portfolio/README.md) — the problem, product, role, and outcomes to validate
- [System design](portfolio/SYSTEM_DESIGN.md) — architecture, reliability, and compliance decisions
- [Product decisions](portfolio/PRODUCT_DECISIONS.md) — the tradeoffs behind the MVP

## Public product snapshot

1. A contractor logs a quote in seconds.
2. ReKnock sends a small, pre-approved sequence in the contractor's voice.
3. The sequence freezes when the homeowner replies.
4. The contractor takes over through a simple relay inbox.

The core design constraint is trust: the system can automate routine follow-up, but it must never hide a real customer conversation from the contractor.

## Selected stack

Next.js, React, TypeScript, Postgres/Supabase, Inngest, Twilio, Resend, Stripe, and Vercel.

## Repository note

The public-facing documents are the recommended starting point for reviewers. Local environment files, deployment credentials, customer information, and operational secrets are excluded from version control.
