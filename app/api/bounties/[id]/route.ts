import { NextResponse } from 'next/server';
import { isConfigured, getContract, rpcProvider, formatBounty } from '@/lib/chain';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isConfigured) return NextResponse.json({ error: 'Not deployed' }, { status: 503 });
  const { id } = await context.params;
  if (!/^(0|[1-9]\d*)$/.test(id) || !Number.isSafeInteger(Number(id))) return NextResponse.json({ error: 'Invalid bounty ID' }, { status: 400 });
  try {
    const contract = getContract(rpcProvider());
    const total = Number(await contract.bountyCount());
    if (Number(id) >= total) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const bounty = formatBounty(Number(id), await contract.getBounty(Number(id)));
    const submissions = await Promise.all(Array.from({ length: bounty.submissions }, (_, index) => contract.getSubmission(Number(id), index).then((s: any) => ({ developer: String(s.developer), submittedAt: Number(s.submittedAt), proofURI: String(s.proofURI), index }))));
    return NextResponse.json({ bounty, submissions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to read contract' }, { status: 502 });
  }
}
