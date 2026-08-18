import { ClientsView } from "@/components/clients/ClientsView";

// The page gate is middleware's job (`clients.read` via routePermission in
// src/lib/auth.ts). Per-record rights come back with the data, so this is a thin
// shell — see src/lib/clients.ts for the rules that actually decide who may
// change what.
export const metadata = { title: "Clients · Nexus" };

export default function ClientsPage() {
  return <ClientsView />;
}
