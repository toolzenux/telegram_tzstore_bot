/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: { optimizePackageImports: ['lucide-react', '@telegram-apps/telegram-ui'] },
  async rewrites() {
    return [
      {
        source: '/tz-api/:path*',
        destination: '/api/:path*',
      },
      {
        source: '/admin',
        destination: '/admin/index.html',
      },
      {
        source: '/admin/:path*',
        destination: '/admin/index.html',
      },
    ];
  },
};
export default nextConfig;
