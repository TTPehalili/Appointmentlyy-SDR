/**
 * Demo builds (NEXT_PUBLIC_DEMO_LOGIN=1) keep the browser-only password login, URL session
 * overrides and seeded sample data for screenshots and sales demos. Never set it in production.
 * Plain module (no 'use client') so both server and browser code can read it.
 */
export const DEMO_LOGIN = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';
