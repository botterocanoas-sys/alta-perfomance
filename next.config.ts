import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // O parser do relatório roda no servidor e usa a biblioteca xlsx.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
