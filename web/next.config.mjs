/** Static export: the whole site is prerendered to `out/` and served as files. */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
