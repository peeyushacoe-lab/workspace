import SlidesEditor from "@/components/SlidesEditor";

export default async function SlideEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="h-screen overflow-hidden">
      <SlidesEditor presId={id} />
    </div>
  );
}
