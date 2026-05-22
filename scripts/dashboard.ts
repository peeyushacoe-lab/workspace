import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "../src/lib/queues/email.queue";
import { dlpQueue } from "../src/lib/queues/dlp.queue";

const DASHBOARD_USER = process.env.DASHBOARD_USER || "admin";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "cybersage";

function basicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="CyberSage Queue Dashboard"');
    res.status(401).send("Authentication required");
    return;
  }
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
  if (user !== DASHBOARD_USER || pass !== DASHBOARD_PASS) {
    res.status(401).send("Invalid credentials");
    return;
  }
  next();
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(dlpQueue),
  ],
  serverAdapter,
});

const app = express();
app.use("/admin/queues", basicAuth, serverAdapter.getRouter());

const port = process.env.DASHBOARD_PORT || 3001;
app.listen(port, () => {
  console.log(`📊 Bull Board → http://localhost:${port}/admin/queues`);
  console.log(`   Login: ${DASHBOARD_USER} / ${DASHBOARD_PASS}`);
});
