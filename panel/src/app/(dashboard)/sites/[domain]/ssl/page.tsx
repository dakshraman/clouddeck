import { SiteDetail } from "@/components/site-detail";

export default async function SiteSslPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <SiteDetail domain={domain} initialTab="overview" autoOpenWildcardSsl={true} />;
}
