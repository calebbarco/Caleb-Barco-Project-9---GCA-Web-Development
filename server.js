import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);
const ALLOWED_MODELS = new Set([
  "gpt-4o-search-preview",
  "gpt-4o-mini-search-preview",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
]);

app.use(express.json({ limit: "100kb" }));

/* Prevent serving server configuration or source metadata over static HTTP */
app.use((req, res, next) => {
  const blockedPaths = ["/server.js", "/package.json", "/package-lock.json"];
  if (blockedPaths.includes(req.path)) {
    return res.status(404).send("Not found");
  }
  next();
});

app.use(express.static(__dirname, { dotfiles: "deny" }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* Validate incoming chat messages before forwarding to OpenAI */
function validateMessages(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { error: "messages must be a non-empty array." };
  }

  if (rawMessages.length > 50) {
    return { error: "Too many messages in conversation history." };
  }

  const sanitized = [];
  for (const msg of rawMessages) {
    if (
      !msg ||
      typeof msg !== "object" ||
      !ALLOWED_ROLES.has(msg.role) ||
      typeof msg.content !== "string"
    ) {
      return { error: "Each message must include a valid role and string content." };
    }

    const trimmedContent = msg.content.trim();
    if (!trimmedContent || trimmedContent.length > 20000) {
      return { error: "Message content must be between 1 and 20,000 characters." };
    }

    sanitized.push({
      role: msg.role,
      content: trimmedContent,
    });
  }

  return { messages: sanitized };
}

/* Validate and normalize URL citations returned by OpenAI web search */
function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function extractCitations(messageObj) {
  const rawAnnotations = Array.isArray(messageObj?.annotations)
    ? messageObj.annotations
    : [];
  const seenUrls = new Set();
  const citations = [];
  const annotations = [];

  for (const ann of rawAnnotations) {
    if (!ann || ann.type !== "url_citation") continue;

    const source = ann.url_citation || ann;
    const safeUrl = sanitizeHttpUrl(source?.url);
    if (!safeUrl) continue;

    const title =
      typeof source?.title === "string" && source.title.trim()
        ? source.title.trim()
        : new URL(safeUrl).hostname;

    annotations.push({
      type: "url_citation",
      url_citation: {
        url: safeUrl,
        title,
        start_index:
          typeof source.start_index === "number" ? source.start_index : undefined,
        end_index:
          typeof source.end_index === "number" ? source.end_index : undefined,
      },
    });

    if (!seenUrls.has(safeUrl)) {
      seenUrls.add(safeUrl);
      citations.push({ title, url: safeUrl });
    }
  }

  return { annotations, citations };
}

/* Proxy routine generation and advisor chat requests to OpenAI API or Worker */
app.post("/api/chat", async (req, res) => {
  const validation = validateMessages(req.body?.messages);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const requestedModel =
    typeof req.body?.model === "string" && ALLOWED_MODELS.has(req.body.model)
      ? req.body.model
      : "gpt-4o-search-preview";

  const workerUrl = process.env.OPENAI_WORKER_URL?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();

  if (!workerUrl && !openAiKey) {
    return res.status(503).json({
      error:
        "OpenAI API is not configured yet. Set OPENAI_API_KEY or OPENAI_WORKER_URL in your environment.",
    });
  }

  try {
    let targetUrl = "https://api.openai.com/v1/chat/completions";
    const headers = {
      "Content-Type": "application/json",
    };

    if (workerUrl) {
      const parsedWorker = new URL(workerUrl);
      if (parsedWorker.protocol !== "https:") {
        return res.status(500).json({
          error: "Configured OPENAI_WORKER_URL must use HTTPS.",
        });
      }
      targetUrl = parsedWorker.toString();
    } else {
      headers.Authorization = `Bearer ${openAiKey}`;
    }

    const requestPayload = {
      model: requestedModel,
      messages: validation.messages,
    };

    if (requestedModel.includes("search-preview")) {
      requestPayload.web_search_options = {
        search_context_size: "medium",
      };
    }

    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
    });

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      const upstreamMsg =
        data?.error?.message ||
        `OpenAI request failed with status ${upstreamResponse.status}.`;
      return res.status(upstreamResponse.status).json({ error: upstreamMsg });
    }

    const messageObj = data?.choices?.[0]?.message;
    const reply = messageObj?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Received an unexpected response format from OpenAI.",
      });
    }

    const { annotations, citations } = extractCitations(messageObj);

    return res.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: reply,
            annotations,
            citations,
          },
        },
      ],
    });
  } catch (error) {
    console.error("Error calling OpenAI proxy:", error.message);
    return res.status(502).json({
      error: "Unable to reach the OpenAI service right now. Please try again.",
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
