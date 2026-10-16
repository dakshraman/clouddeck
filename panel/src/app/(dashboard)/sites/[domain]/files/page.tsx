import { FileBrowser } from "@/components/files/file-browser";

export default async function SiteFilesPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  return <FileBrowser domain={domain} />;
}
