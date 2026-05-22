// Mail module — sending, templates, recipients, config
export { getEmailConfig, canUserSendFrom } from "@/lib/email-config";
export { defaultTemplates, toPrismaTemplate } from "@/lib/templates";
export { mergeContacts, parseContactsText } from "@/lib/recipients";
export { emailQueue, EMAIL_QUEUE_NAME } from "@/lib/queues/email.queue";
export { dlpQueue, DLP_QUEUE_NAME } from "@/lib/queues/dlp.queue";
