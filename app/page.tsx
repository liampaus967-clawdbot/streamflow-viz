'use client';

import dynamic from 'next/dynamic';

const StreamflowMap = dynamic(() => import('@/components/StreamflowMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: 'white',
      fontSize: '18px'
    }}>
      Loading Streamflow Map...
    </div>
  ),
});

export default function Home() {
  return <StreamflowMap />;
}
