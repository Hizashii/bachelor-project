import { roadPriceListSchema } from "@freight-desk/shared";
import Fastify from "fastify";
import { z } from "zod";
import { createRoadExport } from "./export/road-workbook.ts";
import {
  FeedbackConfigurationError,
  readFeedbackEmailConfig,
  sendFeedbackEmail,
} from "./feedback/email.ts";

const exportRequestSchema = z
  .object({ submissions: z.array(roadPriceListSchema).min(1).max(100) })
  .strict();
const feedbackRequestSchema = z
  .object({
    carrierId: z.string().trim().min(1).max(100),
    carrierName: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
  })
  .strict();

const server = Fastify({ logger: false });

server.get("/api/health", async () => ({ status: "ok" }));

server.post("/api/feedback", async (request, reply) => {
  const parsed = feedbackRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ message: "A feedback message is required." });
  }

  const emailConfig = readFeedbackEmailConfig(process.env);
  if (!emailConfig) {
    return reply
      .code(503)
      .send({ message: "Feedback email is not configured." });
  }

  try {
    await sendFeedbackEmail(emailConfig, parsed.data);
    return reply.code(200).send({ status: "sent" });
  } catch (error) {
    if (error instanceof FeedbackConfigurationError) {
      return reply.code(503).send({ message: error.message });
    }
    return reply
      .code(502)
      .send({ message: "The feedback email could not be sent." });
  }
});

server.post("/api/exports/road", async (request, reply) => {
  const parsed = exportRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply
      .code(400)
      .send({ message: "The submitted price list is invalid." });
  }

  const templatePath = process.env.ROAD_TEMPLATE_PATH;
  if (!templatePath) {
    return reply
      .code(503)
      .send({ message: "The road workbook template is not configured." });
  }

  try {
    const exportFile = await createRoadExport(
      templatePath,
      parsed.data.submissions,
    );
    return reply
      .header("Content-Type", exportFile.contentType)
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(exportFile.filename)}`,
      )
      .send(exportFile.data);
  } catch {
    return reply
      .code(500)
      .send({ message: "The Excel export could not be created." });
  }
});

const port = Number(process.env.PORT ?? 3000);
await server.listen({ host: "127.0.0.1", port });
