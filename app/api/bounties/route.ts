import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, getContract, rpcProvider, formatBounty } from '@/lib/chain';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!isConfigured) return NextResponse.json({ error: 'Smart contract not deployed', bounties: [], total: 0 }, { status: 503 });
  try {
    const contract = getContract(rpcProvider());
    const total = Number(await contract.bountyCount());
    const query = request.nextUrl.searchParams;
    const requestedOffset = Number(query.get('offset') || '0');
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const indexes = Array.from({ length: Math.max(0, Math.min(24, total - offset)) }, (_, i) => total - 1 - offset - i);
    const bounties = await Promise.all(indexes.map(async (index) => formatBounty(index, await contract.getBounty(index))));
    return NextResponse.json({ bounties, total, nextOffset: offset + indexes.length < total ? offset + indexes.length : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('bounties read failed:', err instanceof Error ? err.message : 'unknown');
    return NextResponse.json({ error: 'Unable to read bounties from the chain' }, { status: 502 });
  }
}
