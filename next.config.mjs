import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // silence "multiple lockfiles" warning and keep build tracing inside this project
  outputFileTracingRoot: path.join(import.meta.dirname ?? process.cwd()),
};

export default nextConfig;
