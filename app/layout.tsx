import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'RobinBounty — Ship work. Get rewarded.',
  description: 'An onchain developer bounty marketplace with auditable escrow on Robinhood Chain.',
  robots: { index: true, follow: true },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
