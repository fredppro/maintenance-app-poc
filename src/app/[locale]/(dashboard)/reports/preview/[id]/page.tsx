import { PreviewFrame } from "@/features/report/ui/PreviewFrame";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string; }>;
}) {
  const { id } = await params;

  return (
    <div className="h-screen">
      <PreviewFrame taskId={id} />
    </div>
  );
}