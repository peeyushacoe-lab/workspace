export type TemplateKey = "accepted" | "rejected" | "interview" | "reminder";

export type TemplateDefinition = {
  id: string;
  label: string;
  description: string;
  subject: string;
  body: string;
  defaultKey?: TemplateKey;
};

export type ContactInput = {
  name: string;
  email: string;
  status: string;
  firstName?: string;
  lastName?: string;
  interviewDate?: string;
  customMessage?: string;
};

export type CampaignRequest = {
  title: string;
  subject: string;
  body: string;
  template?: TemplateKey;
  contacts: ContactInput[];
  firstName?: string;
  lastName?: string;
  interviewDate?: string;
  customMessage?: string;
  signatureId?: string;
};
