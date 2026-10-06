import { NextResponse } from 'next/server';

// Liveness probe for the host (Railway). It must not touch external services.
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
