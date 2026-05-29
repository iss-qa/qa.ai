import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build standalone para Docker - reduz imagem final em ~10x.
  // outputFileTracingRoot aponta para a raiz do monorepo para incluir
  // node_modules compartilhado via pnpm workspaces.
  output: 'standalone',
  // Next 14: outputFileTracingRoot lives under `experimental` (top-level only
  // from Next 15+). Points at the monorepo root so the standalone bundle
  // includes workspace deps hoisted to the shared pnpm node_modules.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  webpack: (config) => {
    // Use polling with a longer interval to reduce open file descriptors
    // Prevents EMFILE errors on macOS with low maxfiles limit
    config.watchOptions = {
      ...config.watchOptions,
      poll: 1000,
      aggregateTimeout: 300,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/public/maestro-studio/**',
        '**/data/**',
        '**/Maestro/**',
        '**/apps/daemon/**',
      ],
    };
    return config;
  },
  async headers() {
    return [
      {
        // Force no-cache for the extracted Maestro Studio frontend — polyfills and
        // stubs change frequently during dev; we never want stale cache of these.
        source: '/maestro-studio/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
