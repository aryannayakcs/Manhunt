import type { Metadata } from 'next';
import Gallery from '@/components/Gallery';

export const metadata: Metadata = { title: 'Manhunt · every screen', robots: { index: false } };

export default function Page() {
  return <Gallery />;
}
