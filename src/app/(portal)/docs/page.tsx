import { Suspense } from "react";
import { DocsView } from "@/components/DocsView";

export default function DocsPage() {
  return (
    <Suspense>
      <DocsView />
    </Suspense>
  );
}
