import type { Metadata } from 'next';
import BragScenes from '@/components/BragScenes';

export const metadata: Metadata = { title: 'Manhunt · video scenes', robots: { index: false } };

export default function Page() {
  return <BragScenes />;
}
