import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { prisma } from "@/lib/prisma";
import { avatarGradient } from "@/lib/avatar";

async function getContacts() {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  try {
    return await prisma.contact.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  } catch {
    return [];
  }
}

function initials(name: string, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[1][0] : "";
  return `${first}${second}`.toUpperCase();
}

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <>
      <PageHeader
        eyebrow="Contact Management"
        title="Email Recipients"
        description="Manage your contact database with CSV uploads and recipient segmentation for targeted campaigns."
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {contacts.length ? (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">Contact List</h3>
              <p className="text-sm text-muted"><span className="font-mono text-foreground">{contacts.length}</span> total contacts</p>
            </div>

            <ul className="divide-y divide-border-soft">
              {contacts.map((contact) => (
                <li key={contact.id} className="px-6 py-4 hover:bg-surface-sunken transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
                        style={{ background: avatarGradient(contact.email || contact.name) }}
                      >
                        {initials(contact.name, contact.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{contact.name}</p>
                        <p className="text-sm font-mono text-muted">{contact.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex px-3 py-1 text-xs font-mono font-medium rounded-full ${
                      contact.status === 'ACTIVE' ? 'bg-ok/10 text-ok' :
                      contact.status === 'INACTIVE' ? 'bg-surface-sunken text-muted' :
                      'bg-accent/10 text-accent'
                    }`}>
                      {contact.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-surface-sunken rounded-full flex items-center justify-center">
                <Inbox className="h-8 w-8 text-subtle" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No contacts yet</h3>
            <p className="text-muted mb-6">Upload a CSV file from the dashboard to populate your contact list.</p>
            <div className="text-sm text-subtle">
              Supported formats: CSV with columns for name, email, and status
            </div>
          </div>
        )}
      </div>
    </>
  );
}
