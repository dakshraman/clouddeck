import { SiteDetail } from "@/components/site-detail";

export default async function SiteDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <SiteDetail domain={domain} />;
}
