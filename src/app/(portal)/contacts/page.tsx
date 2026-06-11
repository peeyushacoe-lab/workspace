import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { prisma } from "@/lib/prisma";

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
          <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="text-lg font-semibold text-[#dfe1f6]">Contact List</h3>
              <p className="text-sm text-[#9aa3b8]">{contacts.length} total contacts</p>
            </div>

            <ul className="divide-y divide-[#262b3a]">
              {contacts.map((contact) => (
                <li key={contact.id} className="px-6 py-4 hover:bg-[#262939] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00d2ff]/10 text-[#00d2ff] font-semibold">
                        {initials(contact.name, contact.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#dfe1f6]">{contact.name}</p>
                        <p className="text-sm text-[#9aa3b8]">{contact.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      contact.status === 'ACTIVE' ? 'bg-[#06d6a0]/10 text-[#06d6a0]' :
                      contact.status === 'INACTIVE' ? 'bg-[#262939] text-[#9aa3b8]' :
                      'bg-[#00d2ff]/10 text-[#7dd8f5]'
                    }`}>
                      {contact.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-[#1b1f2e] rounded-xl border border-[rgba(255,255,255,0.08)] p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-[#262939] rounded-full flex items-center justify-center">
                <Inbox className="h-8 w-8 text-[#707a90]" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-[#dfe1f6] mb-2">No contacts yet</h3>
            <p className="text-[#9aa3b8] mb-6">Upload a CSV file from the dashboard to populate your contact list.</p>
            <div className="text-sm text-[#707a90]">
              Supported formats: CSV with columns for name, email, and status
            </div>
          </div>
        )}
      </div>
    </>
  );
}
