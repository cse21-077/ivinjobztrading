/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
});

const nextConfig = {
  reactStrictMode: false,
  images: {
    domains: ['avatars.githubusercontent.com', 'lh3.googleusercontent.com'],
  },
  eslint: {
    // Don't fail build on ESLint warnings in production
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },
  typescript: {
    // Don't fail build on TypeScript errors in production
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  webpack: (config) => {
    // SVGR config
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });
    
    return config;
  },
  // Add trailing slash to improve routing
  trailingSlash: true,
  // Allow larger page data
  experimental: {
    largePageDataBytes: 800 * 1024, // 800KB - doubled from default
  },
};

module.exports = withPWA(nextConfig);
