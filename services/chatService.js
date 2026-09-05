const OpenAI = require("openai");

// OpenRouter compatibility: if the key starts with sk-or-, use OpenRouter base URL
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

function extractParams(rawRequest) {
  if (!rawRequest) return [];
  const params = new Set();
  const firstLine = rawRequest.split('\n')[0];
  const urlMatch = firstLine.match(/\?(.*)\sHTTP/);
  if (urlMatch && urlMatch[1]) {
    urlMatch[1].split('&').forEach(p => params.add(p.split('=')[0]));
  }
  const bodyParts = rawRequest.split("\n\n");
  if (bodyParts.length > 1) {
    const body = bodyParts[1].trim();
    if (body.includes('=') && body.includes('&')) {
        body.split("&").forEach(p => params.add(p.split("=")[0]));
    } else if (body.startsWith('{')) {
        try {
            const json = JSON.parse(body);
            Object.keys(json).forEach(k => params.add(k));
        } catch(e) {}
    }
  }
  return Array.from(params);
}

function safeParse(content) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON structure found");

    const parsed = JSON.parse(match[0]);

    return {
      reasoning: (parsed.reasoning && parsed.reasoning.trim()) || "Deep technical analysis completed by EagleEye Engine.",
      reply: (parsed.reply && parsed.reply.trim()) || "I have analyzed the request. Please expand 'Thinking Process' for logic or check the actions below.",
      actions: parsed.actions || []
    };

  } catch (err) {
    console.error("AI JSON PARSE ERROR:", err.message);
    const cleanContent = content ? content.replace(/```json|```/g, "").trim() : "";
    return {
      reasoning: "The AI did not follow the structured JSON format. Displaying raw technical output.",
      reply: cleanContent || "I have successfully processed the packet. While the summary failed to format, technical attack actions have been generated below.",
      actions: []
    };
  }
}

async function chatWithAI({ message, rawRequest, history, selectedVuln, lastResponse, mode }) {
  if (!apiKey) {
    return {
      reasoning: "Configuration Error",
      reply: "OpenAI API Key is missing. Please check your .env file on the server.",
      actions: []
    };
  }

  const truncatedRequest = rawRequest ? rawRequest.substring(0, 3000) : "";
  const params = extractParams(truncatedRequest);
  const isLogin = truncatedRequest.toLowerCase().includes("login") || truncatedRequest.toLowerCase().includes("auth");

  // Define system prompt based on mode
  let systemPrompt = "";
  const activeMode = (mode || "chat").toLowerCase();

  if (activeMode === "analyzer") {
    systemPrompt = `You are EagleEye Security AI, an advanced vulnerability analyzer.
Your job is to perform a full security analysis of the provided HTTP traffic.

When analyzing HTTP traffic you must always return:
1. Overview
2. Request Purpose
3. Parameters (name and value list)
4. Headers (significant headers)
5. Cookies
6. Authentication Analysis
7. Security Findings (e.g. login form, credentials in body, session cookies)
8. Risk Score
9. Recommended Tests
10. Next Actions

Minimum response length: 300 words.
Never answer with one sentence.
Always provide structured sections. Use markdown formatting like ### 🔍 Request Analysis, **Method:**, etc.

Return your response in the mandatory JSON schema format:
{
  "reasoning": "Detailed technical explanation of your thought process",
  "reply": "The full structured markdown response complying with all 10 sections listed above",
  "actions": [
    {
      "label": "Name of vulnerability/action",
      "type": "payload",
      "parameter": "parameter_name",
      "payloads": ["payload1", "payload2"]
    }
  ]
}
`;
  } else if (activeMode === "explainer") {
    systemPrompt = `You are EagleEye Security AI, a cybersecurity explainer assistant.
Provide in-depth explanations of security concepts, vulnerabilities (like SQLi, XSS, SSRF), and mitigations.
Never give short or one-line replies. Use detailed markdown structured sections, explaining the mechanisms, examples, and remediations.

Return your response in JSON format:
{
  "reasoning": "Technical explanation of the concepts",
  "reply": "Detailed markdown formatted explanation",
  "actions": []
}
`;
  } else if (activeMode === "agent") {
    systemPrompt = `You are EagleEye Security AI, a planning and coordinating pentest agent.
Provide a clear structured execution plan to achieve the user's requested security objective.
Enforce format:
### Plan
1. [Step 1 description]
2. [Step 2 description]
...
### Execution Strategy
...

Return your response in JSON format:
{
  "reasoning": "Agent orchestration plan",
  "reply": "Structured markdown plan",
  "actions": []
}
`;
  } else {
    // Default: chat mode
    systemPrompt = `You are EagleEye Security AI, a cybersecurity expert.
Provide concise and clear technical answers. Use markdown bullet points and structures where appropriate.

Return your response in JSON format:
{
  "reasoning": "Thought process summary",
  "reply": "Markdown formatted reply",
  "actions": []
}
`;
  }

  // Inject additional request context for system prompt
  if (truncatedRequest) {
    systemPrompt += `\n\nHTTP Context:\nEndpoint: ${truncatedRequest.split('\n')[0]}\nParameters: ${params.join(", ")}\n${isLogin ? "LOGIN ENDPOINT DETECTED: Prioritize SQLi/Auth bypass." : ""}`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-5).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: message }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: isOpenRouter ? "openai/gpt-4o-mini" : "gpt-4o-mini",
      messages,
      temperature: 0.2
    });

    if (!response.choices || response.choices.length === 0) {
        throw new Error("Provider returned an empty response.");
    }

    const content = response.choices[0].message.content;
    return safeParse(content);
  } catch (err) {
    console.error("AI PROVIDER ERROR:", err.message);
    return { 
      reasoning: "The AI provider (OpenAI/OpenRouter) returned an error. This usually happens if the API key is invalid, credits are low, or the request exceeded the provider's limits.", 
      reply: "AI Provider Error: " + err.message, 
      actions: [] 
    };
  }
}

module.exports = { chatWithAI };
