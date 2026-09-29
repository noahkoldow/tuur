import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@tuur/ui', '@tuur/shared'],
  reactStrictMode: true,
};

export default config;
