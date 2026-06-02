/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  webpack: (config) => {
    config.resolve.alias['@content'] = require('path').join(__dirname, 'content')
    return config
  },
  async headers() {
    return [
      {
        source: '/demo',
        headers: [
          // Allow this page to be embedded as an iframe from any origin (portfolio sites etc.)
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ]
  },
}
module.exports = nextConfig
