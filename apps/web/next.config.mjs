/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Use polling with a longer interval to reduce open file descriptors
    // Prevents EMFILE errors on macOS with low maxfiles limit
    config.watchOptions = {
      ...config.watchOptions,
      poll: 1000,
      aggregateTimeout: 300,
      ignored: ['**/node_modules/**', '**/.git/**'],
    };
    return config;
  },
};

export default nextConfig;
