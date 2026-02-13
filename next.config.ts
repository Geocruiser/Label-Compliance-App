import type { NextConfig } from "next";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const repositoryName = "Label-Compliance-App";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPagesBuild ? "export" : undefined,
  images: isGitHubPagesBuild
    ? {
        unoptimized: true,
      }
    : undefined,
  trailingSlash: isGitHubPagesBuild,
  basePath: isGitHubPagesBuild ? `/${repositoryName}` : undefined,
  assetPrefix: isGitHubPagesBuild ? `/${repositoryName}/` : undefined,
};

export default nextConfig;
