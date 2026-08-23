import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ApiReferenceReact } from "@scalar/api-reference-react";
import type { AnyApiReferenceConfiguration } from "@scalar/api-reference-react";
import scalarCss from "@scalar/api-reference-react/style.css?inline";
import { API_BASE } from "../lib/api";

// Scalar fetches the OpenAPI spec from API_BASE, which resolves to VITE_API_URL.
// In local dev this points to the remote server, so spec changes require deployment
// to be visible here. To test locally: temporarily clear VITE_API_URL in client/.env
// and restart the Vite dev server (the Vite proxy will forward /api to localhost:3001).
const scalarConfig: AnyApiReferenceConfiguration = {
  url: `${API_BASE}/docs/openapi.json`,
  theme: "laserwave",
  layout: "modern",
  defaultOpenAllTags: true,
  hideSearch: true,
  showSidebar: true,
  hideDarkModeToggle: false,
  hideDownloadButton: false,
  hideModels: false,
  withDefaultFonts: true,
  defaultHttpClient: { targetKey: "js", clientKey: "fetch" },
};

export default function DevelopersPage() {
  // Inject Scalar CSS only while this page is mounted, then remove it
  // to prevent style leaks (diagonal dashes, layout issues) on other pages
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "scalar-styles";
    style.textContent = scalarCss;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <>
      <Helmet>
        <title>API Documentation - Voces Indígenas</title>
        <meta
          name="description"
          content="Public API documentation for Voces Indígenas. Access published stories, issues, and RSS feeds programmatically."
        />
      </Helmet>
      <div className="border-b border-neutral-200 bg-white px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="text-sm text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
        >
          &larr; Voces Indígenas
        </Link>
        <span className="text-neutral-300">|</span>
        <span className="text-sm font-medium text-neutral-700">
          API Documentation
        </span>
        <span className="text-neutral-300">|</span>
        <span className="text-xs text-amber-600 font-medium">
          Not a stable API &mdash; use at your own risk
        </span>
      </div>
      <div className="min-h-[calc(100vh-3rem)]">
        <ApiReferenceReact configuration={scalarConfig} />
      </div>
    </>
  );
}
