/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the guardian workspace package (pure TS source) into the app bundle.
  transpilePackages: ['guardian'],
};

export default nextConfig;
