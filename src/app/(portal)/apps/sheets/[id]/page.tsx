import SheetsEditor from "@/components/SheetsEditor";

export default async function SheetEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="h-screen overflow-hidden">
      <SheetsEditor sheetId={id} />
    </div>
  );
}
