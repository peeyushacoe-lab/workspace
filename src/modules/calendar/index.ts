// Calendar module
// Business logic lives in API routes for now; this barrel will grow as
// recurring event helpers and availability algorithms are extracted here.
export { indexingQueue } from "@/lib/queues/indexing.queue";
