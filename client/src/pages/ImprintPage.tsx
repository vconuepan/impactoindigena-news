import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { GITHUB_REPO_URL, GITHUB_LICENSE_URL } from "../config";
import { SEO, CommonOgTags } from "../lib/seo";

export default function ImprintPage() {
  return (
    <>
      <Helmet>
        <title>Legal Notice - {SEO.siteName}</title>
        <meta
          name="description"
          content="Legal notice and contact information for Impacto Indígena."
        />
        <meta property="og:title" content={`Legal Notice - ${SEO.siteName}`} />
        <meta
          property="og:description"
          content="Legal notice and contact information for Impacto Indígena."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SEO.siteUrl}/imprint`} />
        <link rel="canonical" href={`${SEO.siteUrl}/imprint`} />
        {CommonOgTags({})}
      </Helmet>

      <div className="page-section">
        <h1 className="page-title">Legal Notice</h1>

        <div className="prose max-w-none">
          <h2 className="section-heading mt-8">Contact</h2>
          <p className="text-neutral-600 leading-relaxed">
            Fundación Coñuepan-Millaquir — impactoindigena.news<br />
            <a
              href="mailto:contacto@fundacionkm.org"
              className="text-brand-800 hover:text-brand-700"
            >
              contacto@fundacionkm.org
            </a>
          </p>

          <hr className="my-10 border-neutral-200" />

          <p>
            For information about data collection and privacy, see our{" "}
            <Link to="/privacy" className="text-brand-800 hover:text-brand-700">
              Privacy Policy
            </Link>
            .
          </p>

          <p>
            Impacto Indígena is a fork of{" "}
            <a
              href="https://actuallyrelevant.news"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 hover:text-brand-700"
            >
              Actually Relevant
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            , open source under the{" "}
            <a
              href={GITHUB_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 hover:text-brand-700"
            >
              GNU AGPL v3 license
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            . Source code is available on{" "}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-800 hover:text-brand-700"
            >
              GitHub
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            .
          </p>
        </div>

      </div>
    </>
  );
}
