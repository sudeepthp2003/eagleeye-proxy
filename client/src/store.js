let repeaterRequests = [];
let intruderBase = null;
let aiRequest = "";
let aiResult = null;
let selectedVuln = null;
let lastResponse = null;

export function toRaw(req) {
  const host = req.headers?.host || (req.url ? new URL(req.url).host : "localhost");
  let path = "/";
  try {
     const u = new URL(req.url);
     path = u.pathname + u.search;
  } catch(e) { path = req.url; }

  return `${req.method} ${path} HTTP/1.1\nHost: ${host}\n${Object.entries(req.headers || {})
    .filter(([k]) => k.toLowerCase() !== 'host')
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n\n${req.body || ""}`;
}

export function addToRepeater(req) {
  const repeaterReq = {
    ...req,
    raw: toRaw(req),
    response: null,
    status: null,
    responseHeaders: null,
    id: Date.now()
  };
  repeaterRequests.push(repeaterReq);
}

export function addRawToRepeater(raw) {
  const repeaterReq = {
    raw: raw,
    response: null,
    status: null,
    responseHeaders: null,
    id: Date.now()
  };
  repeaterRequests.push(repeaterReq);
}

export function addToIntruder(req) {
    intruderBase = {
        ...req,
        raw: toRaw(req),
        id: Date.now()
    };
}

export function setRawToIntruder(raw) {
    intruderBase = {
        raw: raw,
        id: Date.now()
    };
}

let decoderInput = "";

export function setDecoderInput(text) {
  decoderInput = text;
}

export function getDecoderInput() {
  return decoderInput;
}

export function setAIRequest(raw) {
  aiRequest = raw;
}

export function getAIRequest() {
  return aiRequest;
}

let intruderPayloads = [];

export function setIntruderPayloads(payloads) {
    intruderPayloads = payloads;
}

export function getIntruderPayloads() {
    return intruderPayloads;
}

export function setAIResult(res) {
  aiResult = res;
}

export function getAIResult() {
  return aiResult;
}

export function getIntruderBase() {
    return intruderBase;
}

export function getRepeaterRequests() {
  return repeaterRequests;
}

export function setSelectedVuln(vuln) {
  selectedVuln = vuln;
}

export function getSelectedVuln() {
  return selectedVuln;
}

export function setLastResponse(res) {
  lastResponse = res;
}

export function getLastResponse() {
  return lastResponse;
}

let chatHistory = [
  {
    role: "assistant",
    content: { 
      reply: "Hello! I am EagleEye AI. I have access to your current request context and vulnerabilities. How can I assist you with your exploitation strategy today?",
      actions: []
    }
  }
];

export function getChatHistory() {
  return chatHistory;
}

export function setChatHistory(history) {
  chatHistory = history;
}
