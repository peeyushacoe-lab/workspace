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
          <div className="bg-white rounded-xl border border-[#e8eaed] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#e8eaed]">
              <h3 className="text-lg font-semibold text-[#202124]">Contact List</h3>
              <p className="text-sm text-[#5f6368]">{contacts.length} total contacts</p>
            </div>

            <ul className="divide-y divide-[#262b3a]">
              {contacts.map((contact) => (
                <li key={contact.id} className="px-6 py-4 hover:bg-[#f1f3f4] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a56db]/10 text-[#1a56db] font-semibold">
                        {initials(contact.name, contact.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#202124]">{contact.name}</p>
                        <p className="text-sm text-[#5f6368]">{contact.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      contact.status === 'ACTIVE' ? 'bg-[#f8fafd]/10 text-[#06d6a0]' :
                      contact.status === 'INACTIVE' ? 'bg-[#f1f3f4] text-[#5f6368]' :
                      'bg-[#1a56db]/10 text-[#7dd8f5]'
                    }`}>
                      {contact.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e8eaed] p-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-[#f1f3f4] rounded-full flex items-center justify-center">
                <Inbox className="h-8 w-8 text-[#80868b]" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-[#202124] mb-2">No contacts yet</h3>
            <p className="text-[#5f6368] mb-6">Upload a CSV file from the dashboard to populate your contact list.</p>
            <div className="text-sm text-[#80868b]">
              Supported formats: CSV with columns for name, email, and status
            </div>
          </div>
        )}
      </div>
    </>
  );
}
