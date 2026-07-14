/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["ioredis", "bullmq"],
};

export default nextConfig;
