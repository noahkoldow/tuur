import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tuur/ui', '@tuur/shared'],
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },
};

export default config;
