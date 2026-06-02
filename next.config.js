/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  webpack: (config) => {
    config.resolve.alias['@content'] = require('path').join(__dirname, 'content')
    return config
  },
}
module.exports = nextConfig
