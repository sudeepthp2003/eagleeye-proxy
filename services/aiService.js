const OpenAI = require("openai");

const apiKey = process.env.OPENAI_API_KEY || "dummy-key";
const isOpenRouter = apiKey && apiKey.startsWith("sk-or-");

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: isOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "EagleEye Proxy",
  }
});


const cache = new Map();

async function analyzeRequest(rawRequest) {
  try {
    if (cache.has(rawRequest)) {
      console.log("[AI] Returning cached result");
      return cache.get(rawRequest);
    }

    console.log("[AI] Analyzing request...");

    const prompt = `
  You are an elite cybersecurity expert and penetration tester.

  Analyze this HTTP request deeply for ACTIVELY EXPLOITABLE vulnerabilities.
  
  STRICT RULES:
  - NO generic vulnerabilities (Weak Hashing, IDOR unless parameters are obvious, Info Disclosure).
  - FOCUS ONLY on injection points (SQLi, XSS, SSRF, Command Injection, LFI).
  - FOR XSS: Analyze if the parameter is likely reflected in HTML, JS, or stored.
  
  Identify:
  1. Endpoint type
  2. Top 3 highest-confidence exploitable vulnerabilities.
  3. Exact parameter(s) to attack.
  4. Real-world payloads.

  Return ONLY JSON in this format:
  {
    "endpointType": "...",
    "attacks": [
      {
        "name": "SQL Injection",
        "parameter": "username",
        "payloads": ["' OR 1=1--"],
        "confidence": 0.9,
        "reason": "..."
      }
    ]
  }

  Request:
  ${rawRequest}
  `;

    const response = await openai.chat.completions.create({
      model: "openai/gpt-oss-120b:free",
      messages: [
        { role: "system", content: "You are a professional penetration testing expert. Return ONLY valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI did not return valid JSON. Response was: " + content);
    }

    const result = JSON.parse(jsonMatch[0]);
    cache.set(rawRequest, result);
    return result;
  } catch (err) {
    console.error("🔥 AI SERVICE ERROR:", err);
    throw err;
  }
}

async function generatePayloads({ attackType, technique, parameter, request }) {
  console.log(`[AI SERVICE] Generating ${technique} payloads for ${attackType} on ${parameter}...`);
  try {
    const prompt = `
  You are an expert penetration tester and exploit developer.
  Generate exactly 5 highly effective, weaponized payloads for a ${attackType} attack.
  
  Technique: ${technique}
  Target Parameter: ${parameter}
  Request Context:
  ${request}

  CONTEXT SHAPING:
  - If XSS: Analyze if it's Reflected, Stored, or DOM based on the request. Generate context-aware payloads (HTML tag injection, JS event handler injection, or polyglots).
  - If SQLi: Use ${technique} specific primitives (UNION, SLEEP, Error-based).

  STRICT RULES:
  1. Payloads must be valid for the specific technique (${technique}).
  2. Return ONLY a JSON object with a "payloads" array.
  3. DO NOT provide any explanation or markdown outside the JSON.

  Example Output:
  {
    "payloads": ["payload1", "payload2", "payload3", "payload4", "payload5"]
  }
  `;

    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional security researcher. Return ONLY valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON for payloads");
    
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("🔥 PAYLOAD GEN ERROR:", err);
    throw err;
  }
}

async function analyzeDeep(rawRequest) {
  try {
    const prompt = `
  You are an expert penetration tester.
  Analyze this HTTP request like a real attacker.
  Think like you are actively exploiting this request.

  STRICT EXCLUSION LIST (DO NOT INCLUDE):
  - Generic IDOR (unless parameters like 'user_id' are clearly vulnerable)
  - Weak Password Storage / Hashing (Not testable from request)
  - Missing Security Headers (Trivial)
  - SSL/TLS issues (Generic)

  ACTUAL FOCUS (INCLUDE ONLY):
  - Actively exploitable injection points
  - Cross-Site Scripting (Reflected/Stored context)
  - SQL Injection (Boolean/Union/Time)
  - SSRF/LFI/Command Injection

  Return top 3 vulnerabilities ONLY.
  Each vulnerability MUST include real payloads.

  Return ONLY JSON in this exact structure:
  {
    "summary": {
      "type": "e.g. Authentication, Data API, File Upload",
      "risk": "Critical|High|Medium|Low"
    },
    "vulnerabilities": [
      {
        "name": "e.g. SQL Injection",
        "parameter": "user_id",
        "location": "Header|Body|URL",
        "confidence": 0.0,
        "impact": "Brief technical impact",
        "payloads": ["payload1", "payload2"]
      }
    ],
    "priority": ["vulnerability names sorted by criticality"],
    "nextSteps": ["Step 1", "Step 2"]
  }
  
  Request:
  ${rawRequest}
  `;

    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional security researcher. Return ONLY vulnerabilities that can be ACTIVELY TESTED from the provided request parameters. Avoid guessing server-side configuration like password hashing." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON for Deep Analysis");

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("🔥 ANALYZE DEEP ERROR:", err);
    throw err;
  }
}

async function chatWithAI(userMessage, rawRequest, history = [], selectedVuln = null, lastResponse = null, beginnerMode = false) {
  try {
    const messages = [
      { 
        role: "system", 
        content: `You are EagleEye AI, a professional cybersecurity assistant.
        Analyze the following HTTP request/response context and answer user queries with deep technical insight.
        
        ${beginnerMode ? "BEGINNER MODE IS ON: Explain concepts simply, avoid overly dense jargon, and focus on fundamental security principles." : "EXPERT MODE: Be technically precise, use industry-standard terminology, and provide deep architectural analysis."}

        REQUEST CONTEXT:
        ${rawRequest}
        
        ${selectedVuln ? `SELECTED VULNERABILITY: ${selectedVuln.name}\nTARGET PARAMETER: ${selectedVuln.parameter}\nIMPACT: ${selectedVuln.impact}` : ""}
        
        ${lastResponse ? `LAST RESPONSE RECEIVED:\nStatus: ${lastResponse.status}\nHeaders: ${JSON.stringify(lastResponse.headers)}\nBody: ${lastResponse.body?.substring(0, 2000)}` : "NO RESPONSE RECEIVED YET."}

        INSTRUCTIONS:
        1. BREVITY IS MANDATORY: Use bullet points. Do NOT write long paragraphs. 
        2. NO CONVERSATIONAL FILLER: Do not say "I hope this helps" or "Let me know if you need anything else".
        3. ACTIONABLE ONLY: Focus on what the user should DO next.
        4. STRUCTURED DATA: Use the PAYLOAD_GENERATION_START/END block for all suggested payloads.
        5. EXPLOIT SCRIPTS: Provide ready-to-run code snippets for exploit requests.
        6. ANALYZE DATA: Use the provided REQUEST and RESPONSE context to give specific, not generic, answers.
        7. Be extremely concise, highly technical, and strictly prioritize security implications.`
      },
      ...history,
      { role: "user", content: userMessage }
    ];

    console.log(`[AI CHAT] Processing message: "${userMessage.substring(0, 50)}..."`);

    const response = await openai.chat.completions.create({
      model: "openai/gpt-4o-mini", 
      messages,
      temperature: 0.7
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error("Invalid response structure from AI Provider");
    }

    return {
      message: response.choices[0].message.content,
      role: "assistant"
    };
  } catch (err) {
    console.error("🔥 AI CHAT SERVICE ERROR:", err.message);
    throw err;
  }
}

module.exports = { analyzeRequest, analyzeDeep, chatWithAI, generatePayloads };
