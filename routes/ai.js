const express = require("express");
const { analyzeRequest, analyzeDeep, generatePayloads } = require("../services/aiService");
const { chatWithAI } = require("../services/chatService");
const { runAutoAttack } = require("../services/attackEngine");
const OpenAI = require("openai");

const router = express.Router();
console.log("[AI ROUTE] generatePayloads status:", typeof generatePayloads);

// Initialize OpenAI instance for Agent classification
const apiKey = process.env.OPENAI_API_KEY;
const isOpenRouter = apiKey && apiKey.startsWith("sk-or-");

const openai = new OpenAI({
  apiKey: apiKey || "dummy-key",
  baseURL: isOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
  defaultHeaders: isOpenRouter ? {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "EagleEye Proxy",
  } : undefined
});

// Helper: Classify Agent Intent
async function classifyAgentIntent(message, context = "") {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes("repeater") || lowerMsg.includes("repeat") || lowerMsg.includes("send to repeater")) {
    return {
      action: "send_to_repeater",
      reason: "User requested to send the request to the Repeater tab for manual testing.",
      params: {}
    };
  }
  
  if (lowerMsg.includes("jwt") || lowerMsg.includes("json web token")) {
    const jwtRegex = /(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/i;
    const match = message.match(jwtRegex);
    return {
      action: "analyze_jwt",
      reason: "User requested to decode and analyze a JWT token.",
      params: { token: match ? match[1] : null }
    };
  }

  if (lowerMsg.includes("base64") || lowerMsg.includes("decode")) {
    const base64Regex = /([a-zA-Z0-9+/]{4,}=*)/g;
    const matches = message.match(base64Regex) || [];
    const token = matches.find(m => m.length > 8);
    return {
      action: "decode_base64",
      reason: "User requested to decode a base64 encoded string.",
      params: { data: token || "" }
    };
  }

  if (lowerMsg.includes("history") || lowerMsg.includes("find all") || lowerMsg.includes("search logs") || lowerMsg.includes("log")) {
    let query = "";
    if (lowerMsg.includes("login")) query = "login";
    else if (lowerMsg.includes("admin")) query = "admin";
    else if (lowerMsg.includes("auth")) query = "auth";
    return {
      action: "search_history",
      reason: "User requested to search proxy logs.",
      params: { query }
    };
  }

  if (lowerMsg.includes("redirect") || lowerMsg.includes("follow")) {
    return {
      action: "follow_redirect",
      reason: "User requested to follow a redirect response.",
      params: {}
    };
  }

  if (lowerMsg.includes("modify") || lowerMsg.includes("change parameter")) {
    return {
      action: "modify_request",
      reason: "User requested to modify parameters in the request.",
      params: {}
    };
  }

  if (lowerMsg.includes("analyze") || lowerMsg.includes("vulnerability") || lowerMsg.includes("scan")) {
    return {
      action: "analyze_request",
      reason: "User requested to analyze the request for security vulnerabilities.",
      params: {}
    };
  }

  if (lowerMsg.includes("payload") || lowerMsg.includes("generate payloads")) {
    return {
      action: "generate_payloads",
      reason: "User requested SQLi/XSS payload generation.",
      params: {}
    };
  }

  if (lowerMsg.includes("test parameter") || lowerMsg.includes("auto attack") || lowerMsg.includes("test this parameter")) {
    return {
      action: "auto_attack",
      reason: "User requested automated test execution.",
      params: {}
    };
  }

  // Fallback to LLM classifier if API Key is configured
  if (apiKey) {
    try {
      const systemPrompt = `You are EagleEye Security Agent.
Your job is to identify the user's intent and select the single most appropriate tool to run from the following list:
- send_to_repeater: When user wants to send/forward the request to repeater.
- modify_request: When user wants to change a parameter or modify the request.
- follow_redirect: When user wants to follow a redirect.
- decode_base64: When user wants to decode a base64 string.
- search_history: When user wants to find or search logs (e.g. find all logins).
- analyze_jwt: When user wants to analyze/decode a JWT token.
- analyze_request: When user wants to find vulnerabilities in a request.
- generate_payloads: When user wants to generate attack payloads.
- auto_attack: When user wants to test a parameter.

Return ONLY a JSON response in the following format:
{
  "action": "tool_name",
  "reason": "explanation of why this tool was chosen",
  "params": {
    // any parameters required by the tool (e.g., token, data, query, parameter, attackType, technique)
  }
}
`;
      const response = await openai.chat.completions.create({
        model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Message: "${message}"\nContext:\n${context}` }
        ],
        temperature: 0.1
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("[AGENT INTENT CLASSIFICATION ERROR]:", err.message);
    }
  }

  return {
    action: "analyze_request",
    reason: "Defaulting to request analysis based on context.",
    params: {}
  };
}

router.get("/status", (req, res) => {
  res.json({ status: "online", module: "AI Analysis Engine", timestamp: new Date() });
});

router.post("/analyze", async (req, res) => {
  try {
    const { rawRequest } = req.body;
    if (!rawRequest) return res.status(400).json({ error: "rawRequest is required" });
    const result = await analyzeRequest(rawRequest);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "AI analysis failed", details: err.message });
  }
});

router.post("/deep-analyze", async (req, res) => {
  try {
    const { rawRequest } = req.body;
    if (!rawRequest) return res.status(400).json({ error: "rawRequest is required" });
    const result = await analyzeDeep(rawRequest);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Deep AI analysis failed", details: err.message });
  }
});

router.post("/generate-payloads", async (req, res) => {
  console.log(`[AI ROUTE] Incoming payload request: ${req.body.attackType} / ${req.body.technique}`);
  try {
     const { attackType, technique, parameter, request } = req.body;
     const result = await generatePayloads({ attackType, technique, parameter, request });
     console.log(`[AI ROUTE] Success: Generated ${result.payloads?.length || 0} payloads`);
     res.json(result);
  } catch (err) {
     console.error(`[AI ROUTE] Error: ${err.message}`);
     res.status(500).json({ error: "Payload generation failed", details: err.message });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { message, rawRequest, history, selectedVuln, lastResponse, request, response, mode } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    // Adapt Phase 2 context inputs (req.body.request / req.body.response) if present
    let activeRequest = rawRequest || "";
    if (request) {
      activeRequest = typeof request === "string" ? request : JSON.stringify(request, null, 2);
    }
    let activeResponse = lastResponse || null;
    if (response) {
      activeResponse = typeof response === "string" ? { body: response } : response;
    }

    // Call chat service
    const result = await chatWithAI({
      message,
      rawRequest: activeRequest,
      history: history || [],
      selectedVuln,
      lastResponse: activeResponse,
      mode: mode || "chat"
    });

    console.log("FINAL AI RESULT TO CLIENT:", JSON.stringify(result, null, 2));

    // Ensure compliance with expected keys
    const replyText = result.reply || result.message || "Analysis complete.";
    res.json({
      response: replyText,
      reply: replyText,
      reasoning: result.reasoning || "Technical reasoning completed.",
      actions: result.actions || []
    });
  } catch (err) {
    console.error("CHAT ROUTE ERROR:", err);
    res.status(500).json({
      error: "AI Chat failed",
      reply: "The backend chat service encountered an error: " + err.message,
      reasoning: "Internal Server Error during AI processing.",
      actions: []
    });
  }
});

// Phase 3 & 4 AI Agent Endpoint
router.post("/agent", async (req, res) => {
  try {
    const { message, rawRequest, lastResponse, history } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    // Build context string
    const context = `Request Context:\n${rawRequest || "None"}\nLast Response:\n${JSON.stringify(lastResponse || "None")}`;
    
    // Classify intent
    const classification = await classifyAgentIntent(message, context);
    const { action, reason, params } = classification;
    let resultData = null;
    let logsFound = [];

    // Execute server-side actions
    if (action === "search_history") {
      const query = (params.query || "").toLowerCase();
      if (req.logs) {
        logsFound = req.logs.filter(log => 
          log.url.toLowerCase().includes(query) || 
          log.method.toLowerCase().includes(query) ||
          (log.responseBody && log.responseBody.toLowerCase().includes(query))
        ).slice(0, 5);
      }
      resultData = {
        query,
        count: logsFound.length,
        logs: logsFound.map(l => ({
          id: l.id,
          method: l.method,
          url: l.url,
          status: l.status,
          time: l.time
        }))
      };
    } else if (action === "decode_base64") {
      let dataToDecode = params.data || "";
      if (!dataToDecode && rawRequest) {
        const matches = rawRequest.match(/[a-zA-Z0-9+/]{8,}=*/g) || [];
        dataToDecode = matches[0] || "";
      }
      try {
        const decoded = Buffer.from(dataToDecode, 'base64').toString('utf8');
        resultData = { original: dataToDecode, decoded, success: true };
      } catch (err) {
        resultData = { original: dataToDecode, error: err.message, success: false };
      }
    } else if (action === "analyze_jwt") {
      let token = params.token || "";
      if (!token && rawRequest) {
        const jwtRegex = /(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/i;
        const match = rawRequest.match(jwtRegex);
        token = match ? match[1] : "";
      }
      
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            resultData = { token, header, payload, signature: parts[2], success: true };
          } else {
            resultData = { token, error: "Invalid JWT structure", success: false };
          }
        } catch (err) {
          resultData = { token, error: err.message, success: false };
        }
      } else {
        resultData = { error: "No JWT token detected in context", success: false };
      }
    } else if (action === "follow_redirect") {
      let redirectUrl = "";
      if (lastResponse && lastResponse.headers) {
        redirectUrl = lastResponse.headers.location || lastResponse.headers.Location || "";
      }
      
      if (redirectUrl) {
        try {
          const response = await fetch(redirectUrl, { method: "GET", redirect: "manual" });
          const text = await response.text();
          resultData = {
            url: redirectUrl,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            bodySnippet: text.substring(0, 1000),
            success: true
          };
        } catch (err) {
          resultData = { url: redirectUrl, error: err.message, success: false };
        }
      } else {
        resultData = { error: "No Location header found in redirect context", success: false };
      }
    } else if (action === "modify_request") {
      resultData = {
        instruction: "Modify parameter values in the Request editor or Repeater tab.",
        rawRequest,
        success: true
      };
    } else if (action === "analyze_request") {
      if (rawRequest) {
        try {
          const analysis = await analyzeDeep(rawRequest);
          resultData = { analysis, success: true };
        } catch (err) {
          resultData = { error: err.message, success: false };
        }
      } else {
        resultData = { error: "No request context provided", success: false };
      }
    } else if (action === "generate_payloads") {
      let parameter = params.parameter || "id";
      let attackType = params.attackType || "SQLi";
      let technique = params.technique || "boolean";
      
      if (rawRequest && !params.parameter) {
        const match = rawRequest.match(/[?&]([^=\s]+)=/);
        if (match) parameter = match[1];
      }
      
      try {
        const generated = await generatePayloads({ attackType, technique, parameter, request: rawRequest });
        resultData = { parameter, attackType, technique, payloads: generated.payloads || [], success: true };
      } catch (err) {
        resultData = { error: err.message, success: false };
      }
    } else if (action === "auto_attack") {
      let parameter = params.parameter || "id";
      if (rawRequest && !params.parameter) {
        const match = rawRequest.match(/[?&]([^=\s]+)=/);
        if (match) parameter = match[1];
      }
      resultData = {
        parameter,
        instruction: "Running automated security test on parameter...",
        success: true
      };
    }

    res.json({
      action,
      reason,
      params,
      result: resultData
    });
  } catch (err) {
    console.error("[AGENT ENDPOINT ERROR]:", err);
    res.status(500).json({ error: "Agent execution failed", details: err.message });
  }
});

router.post("/auto-attack", async (req, res) => {
  try {
    const { rawRequest, parameter } = req.body;
    if (!rawRequest || !parameter) {
       return res.status(400).json({ error: "Missing required fields: rawRequest, parameter" });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const onStep = (step) => {
      res.write(JSON.stringify(step) + "\n");
    };

    const result = await runAutoAttack({ rawRequest, parameter, onStep });
    res.write(JSON.stringify({ type: "final", ...result }) + "\n");
    res.end();
  } catch (err) {
    console.error("AUTO ATTACK ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Auto attack failed", details: err.message });
    } else {
      res.write(JSON.stringify({ type: "error", details: err.message }) + "\n");
      res.end();
    }
  }
});

router.get("/test", async (req, res) => {
  try {
    const result = await analyzeRequest("GET /login?user=admin HTTP/1.1\nHost: example.com\n\n");
    res.json({ status: "success", result });
  } catch (err) {
    res.status(500).json({ error: "AI Test Failed", details: err.message });
  }
});

module.exports = router;
