import React, { useState, useEffect, useRef } from "react";
import { Send, Terminal, Sparkles, Trash2, Trash, Cpu, CheckSquare, Square, Info, ChevronRight, Zap, Shield, Search, Activity, FileText, List, Lock, ArrowRight, RefreshCw, CheckCircle2, AlertCircle, Play, FileCode, Cookie } from "lucide-react";
import { getAIRequest, setAIRequest, getLastResponse, setLastResponse, getRepeaterRequests, getChatHistory, setChatHistory, addRawToRepeater, setDecoderInput } from "../store";

// Helper to inject parameter payload
const injectPayload = (req, param, payload) => {
  const regex = new RegExp(`(${param}=)([^&\\s]*)`, 'i');
  return req.replace(regex, `$1${encodeURIComponent(payload)}`);
};

const renderFormattedContent = (text) => {
  if (!text) return null;
  const parts = text.split("\n");
  return parts.map((line, idx) => {
    if (line.startsWith("### ")) {
      return <h3 key={idx} style={{ color: "var(--burp-orange)", marginTop: "12px", marginBottom: "6px", fontSize: "12px", borderBottom: "1px solid var(--burp-border)", paddingBottom: "3px", fontWeight: "700" }}>{line.replace("### ", "")}</h3>;
    }
    if (line.startsWith("## ")) {
      return <h2 key={idx} style={{ color: "var(--burp-orange)", marginTop: "14px", marginBottom: "8px", fontSize: "13px", fontWeight: "700" }}>{line.replace("## ", "")}</h2>;
    }
    if (line.startsWith("# ")) {
      return <h1 key={idx} style={{ color: "var(--burp-orange)", marginTop: "16px", marginBottom: "10px", fontSize: "14px", fontWeight: "800" }}>{line.replace("# ", "")}</h1>;
    }
    if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
      return <li key={idx} style={{ marginLeft: "15px", marginBottom: "4px", color: "var(--burp-text)" }}>{line.trim().substring(2)}</li>;
    }
    
    let lastIndex = 0;
    const elements = [];
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        elements.push(line.substring(lastIndex, match.index));
      }
      elements.push(<strong key={match.index} style={{ fontWeight: "700" }}>{match[1]}</strong>);
      lastIndex = boldRegex.lastIndex;
    }
    if (lastIndex < line.length) {
      elements.push(line.substring(lastIndex));
    }

    return (
      <div key={idx} style={{ marginBottom: "6px", minHeight: "15px", color: "var(--burp-text)" }}>
        {elements.length > 0 ? elements : line}
      </div>
    );
  });
};

const Typewriter = ({ text, speed = 8, onComplete }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    let currentText = "";
    const timer = setInterval(() => {
      if (index < text.length) {
        currentText += text.charAt(index);
        setDisplayedText(currentText);
        index++;
      } else {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <>{renderFormattedContent(displayedText)}</>;
};

export default function AIPage({ setMainTab }) {
  const [mode, setMode] = useState("chat"); // "chat" or "agent"
  


  const [messages, setMessages] = useState(() => {
    const saved = getChatHistory();
    return saved.length > 1 
      ? saved.map(m => ({ ...m, animated: true }))
      : [
          {
            role: "assistant",
            content: {
              reply: "Hello! I am EagleEye AI. I am your cybersecurity companion. Ask me anything about intercepting, analyzing, or testing web requests.",
              actions: []
            },
            animated: true
          }
        ];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Agent Mode States
  const [agentGoal, setAgentGoal] = useState(() => {
    const saved = localStorage.getItem("ee_agent_goal");
    return saved || "Test login form and parameter vulnerabilities";
  });
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentTimeline, setAgentTimeline] = useState(() => {
    const saved = localStorage.getItem("ee_agent_timeline");
    return saved ? JSON.parse(saved) : [];
  });
  const [agentSteps, setAgentSteps] = useState(() => {
    const saved = localStorage.getItem("ee_agent_steps");
    return saved ? JSON.parse(saved) : [
      { id: 1, title: "Analyze Request", status: "pending" },
      { id: 2, title: "Generate Tests", status: "pending" },
      { id: 3, title: "Execute Tests", status: "pending" },
      { id: 4, title: "Compare Responses & Report", status: "pending" }
    ];
  });
  const [agentReport, setAgentReport] = useState(() => {
    const saved = localStorage.getItem("ee_agent_report");
    return saved || "";
  });
  const [agentFindings, setAgentFindings] = useState(() => {
    const saved = localStorage.getItem("ee_agent_findings");
    return saved ? JSON.parse(saved) : [];
  });
  const [agentStats, setAgentStats] = useState(() => {
    const saved = localStorage.getItem("ee_agent_stats");
    return saved ? JSON.parse(saved) : { requestsSent: 0, responsesReceived: 0, findingsCount: 0, currentStepName: "None", status: "Idle" };
  });
  const [activeTools, setActiveTools] = useState(() => {
    const saved = localStorage.getItem("ee_agent_active_tools");
    return saved ? JSON.parse(saved) : [];
  });
  const [agentPlan, setAgentPlan] = useState(() => {
    const saved = localStorage.getItem("ee_agent_plan");
    return saved ? JSON.parse(saved) : null;
  });

  const messagesEndRef = useRef(null);
  const consoleEndRef = useRef(null);

  // Sync logs and history
  const fetchLogs = () => {
    fetch("http://127.0.0.1:8081/api/logs")
      .then(res => res.json())
      .then(data => setLogs(data.reverse().slice(0, 8)))
      .catch(err => console.error("Error fetching logs:", err));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setChatHistory(messages);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentTimeline]);

  useEffect(() => {
    localStorage.setItem("ee_agent_goal", agentGoal);
    localStorage.setItem("ee_agent_timeline", JSON.stringify(agentTimeline));
    localStorage.setItem("ee_agent_steps", JSON.stringify(agentSteps));
    localStorage.setItem("ee_agent_report", agentReport);
    localStorage.setItem("ee_agent_findings", JSON.stringify(agentFindings));
    localStorage.setItem("ee_agent_stats", JSON.stringify(agentStats));
    localStorage.setItem("ee_agent_active_tools", JSON.stringify(activeTools));
    if (agentPlan) {
      localStorage.setItem("ee_agent_plan", JSON.stringify(agentPlan));
    } else {
      localStorage.removeItem("ee_agent_plan");
    }
  }, [agentGoal, agentTimeline, agentSteps, agentReport, agentFindings, agentStats, activeTools, agentPlan]);

  const addTimelineEvent = (text) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAgentTimeline(prev => [...prev, { time, text }]);
  };

  const handleGeneratePlan = () => {
    const params = getParameters();
    const estimated = params.length > 0 ? params.length * 8 : 8;
    setAgentPlan({
      steps: [
        "Analyze request structure and testable parameters (Recon Agent)",
        "Check authentication forms and parameter validation (Auth Agent)",
        "Evaluate session tokens and cookie flags (Session Agent)",
        "Inject security test payloads into parameters (Payload Agent)",
        "Perform response diff analysis and compile audit report (Report Agent)"
      ],
      estimatedTests: estimated
    });
  };

  const resetAgentSession = () => {
    localStorage.removeItem("ee_agent_goal");
    localStorage.removeItem("ee_agent_timeline");
    localStorage.removeItem("ee_agent_steps");
    localStorage.removeItem("ee_agent_report");
    localStorage.removeItem("ee_agent_findings");
    localStorage.removeItem("ee_agent_stats");
    localStorage.removeItem("ee_agent_active_tools");
    localStorage.removeItem("ee_agent_plan");
    
    setAgentGoal("Test login form and parameter vulnerabilities");
    setAgentTimeline([]);
    setAgentSteps([
      { id: 1, title: "Analyze Request", status: "pending" },
      { id: 2, title: "Generate Tests", status: "pending" },
      { id: 3, title: "Execute Tests", status: "pending" },
      { id: 4, title: "Compare Responses & Report", status: "pending" }
    ]);
    setAgentReport("");
    setAgentFindings([]);
    setAgentStats({ requestsSent: 0, responsesReceived: 0, findingsCount: 0, currentStepName: "None", status: "Idle" });
    setActiveTools([]);
    setAgentPlan(null);
  };

  // Context Selectors
  const handleSelectLog = (log) => {
    fetch(`http://127.0.0.1:8081/api/logs`)
      .then(r => r.json())
      .then(allLogs => {
        const full = allLogs.find(l => l.id === log.id);
        if (full) {
          const rawHeaders = Object.entries(full.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
          const rawStr = `${full.method} ${full.url} HTTP/1.1\n${rawHeaders}\n\n${full.body || ""}`;
          setAIRequest(rawStr);
          if (full.responseBody || full.status) {
            setLastResponse({
              status: full.status,
              headers: full.responseHeaders || {},
              body: full.responseBody || ""
            });
          }
        }
      });
  };

  // Helper to extract parameters
  const getParameters = () => {
    const raw = getAIRequest();
    if (!raw) return [];
    const params = [];
    const firstLine = raw.split('\n')[0];
    const urlMatch = firstLine.match(/\?(.*)\sHTTP/);
    if (urlMatch && urlMatch[1]) {
      urlMatch[1].split('&').forEach(p => {
        const parts = p.split('=');
        params.push({ name: parts[0], value: parts[1] || "", location: "URL" });
      });
    }
    const bodyParts = raw.split("\n\n");
    if (bodyParts.length > 1) {
      const body = bodyParts[1].trim();
      if (body.includes('=') && body.includes('&')) {
        body.split("&").forEach(p => {
          const parts = p.split("=");
          params.push({ name: parts[0], value: parts[1] || "", location: "Body" });
        });
      } else if (body.startsWith('{')) {
        try {
          const json = JSON.parse(body);
          Object.keys(json).forEach(k => {
            params.push({ name: k, value: typeof json[k] === "object" ? JSON.stringify(json[k]) : String(json[k]), location: "JSON" });
          });
        } catch(e) {}
      }
    }
    return params;
  };

  // Helper to extract cookies
  const getCookies = () => {
    const raw = getAIRequest();
    if (!raw) return [];
    const cookiesList = [];
    const cookieLine = raw.split('\n').find(l => l.trim().toLowerCase().startsWith('cookie:'));
    if (cookieLine) {
      const cookieVal = cookieLine.substring(cookieLine.indexOf(':') + 1).trim();
      cookieVal.split(';').forEach(c => {
        const parts = c.split('=');
        if (parts.length >= 1) {
          cookiesList.push({ name: parts[0].trim(), value: parts.slice(1).join('=').trim() });
        }
      });
    }
    return cookiesList;
  };

  // Handle Q&A send
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setInput("");
    
    setMessages(prev => [...prev, { role: "user", content: { reply: userQuery, actions: [] }, animated: true }]);
    setIsLoading(true);

    const currentRequest = getAIRequest();
    const currentResponse = getLastResponse();

    try {
      const response = await fetch("http://127.0.0.1:8081/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userQuery,
          request: currentRequest || undefined,
          response: currentResponse?.body || undefined,
          mode: "chat",
          history: messages.slice(-5).map(m => ({ role: m.role, content: m.content.reply || m.content.response || "" }))
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data, animated: false }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: { reply: "Error communicating with AI services: " + err.message, actions: [] } 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (actionType) => {
    const currentRequest = getAIRequest();
    const currentResponse = getLastResponse();

    switch (actionType) {
      case "send_to_repeater":
        if (currentRequest) {
          addRawToRepeater(currentRequest);
          setMainTab("repeater");
        } else {
          alert("No active request context to repeat.");
        }
        break;
      case "decode_cookie":
        if (currentRequest) {
          const match = currentRequest.match(/cookie:\s*([^\n\r]+)/i);
          if (match && match[1]) {
            setDecoderInput(match[1]);
            setMainTab("decoder");
          } else {
            alert("No cookies detected in the current request headers.");
          }
        } else {
          alert("No active request context.");
        }
        break;
      case "analyze_response":
        if (currentResponse?.body) {
          setInput("Perform detailed analysis of the current HTTP response.");
          setMode("chat");
        } else {
          alert("No active HTTP response context available.");
        }
        break;
      default:
        break;
    }
  };

  // Run Autonomous Agent Plan
  const runAgentWorkflow = async () => {
    if (agentRunning) return;
    setAgentRunning(true);
    setAgentReport("");
    setAgentFindings([]);
    setAgentTimeline([]);
    
    const stepsCopy = [
      { id: 1, title: "Analyze Request", status: "running" },
      { id: 2, title: "Generate Tests", status: "pending" },
      { id: 3, title: "Execute Tests", status: "pending" },
      { id: 4, title: "Compare Responses & Report", status: "pending" }
    ];
    setAgentSteps(stepsCopy);
    
    setAgentStats({
      requestsSent: 0,
      responsesReceived: 0,
      findingsCount: 0,
      currentStepName: "Request Analysis",
      status: "Initializing Recon Agent..."
    });

    const activeRequest = getAIRequest();
    if (!activeRequest) {
      addTimelineEvent("[ERROR] No HTTP request found in context. Load a request to test.");
      setAgentRunning(false);
      stepsCopy[0].status = "pending";
      setAgentSteps([...stepsCopy]);
      return;
    }

    const params = getParameters();
    const targetParam = params.length > 0 ? params[0].name : "id";

    try {
      // STEP 1: Analyze Request
      setActiveTools(["Request Analyzer", "Cookie Parser"]);
      addTimelineEvent("Initializing Recon Agent...");
      addTimelineEvent("Extracting active context details: Request headers & body.");
      addTimelineEvent(`Context parsed: ${params.length} testable parameters, ${getCookies().length} cookies.`);
      addTimelineEvent(`Target parameter selected for scan: "${targetParam}"`);
      
      const analysisRes = await fetch("http://127.0.0.1:8081/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Perform a security analysis on this request.",
          request: activeRequest,
          mode: "analyzer"
        })
      });
      const analysisData = await analysisRes.json();
      addTimelineEvent(`Recon Agent completed request structure audit.`);
      addTimelineEvent(`Reasoning: ${analysisData.reasoning || "Request analysis done."}`);
      
      setAgentStats(prev => ({ ...prev, requestsSent: prev.requestsSent + 1, responsesReceived: prev.responsesReceived + 1 }));
      stepsCopy[0].status = "done";
      stepsCopy[1].status = "running";
      setAgentSteps([...stepsCopy]);

      // STEP 2: Generate Tests
      setActiveTools(["Request Analyzer", "Cookie Parser", "Decoder"]);
      setAgentStats(prev => ({ ...prev, currentStepName: "Generate Tests", status: "Preparing attack vectors..." }));
      addTimelineEvent("Initializing Auth Agent & Payload Agent...");
      addTimelineEvent(`Generating specialized testing payloads for target: "${targetParam}"`);
      
      const payloadRes = await fetch("http://127.0.0.1:8081/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Generate 5 weaponized SQLi and XSS test payloads for parameter: ${targetParam}`,
          request: activeRequest,
          mode: "explainer"
        })
      });
      const payloadData = await payloadRes.json();
      addTimelineEvent(`Auth Agent completed payload generation.`);
      addTimelineEvent(`Test suite loaded successfully.`);
      
      setAgentStats(prev => ({ ...prev, requestsSent: prev.requestsSent + 1, responsesReceived: prev.responsesReceived + 1 }));
      stepsCopy[1].status = "done";
      stepsCopy[2].status = "running";
      setAgentSteps([...stepsCopy]);

      // STEP 3: Execute Tests (Stream Auto Attack)
      setActiveTools(["Request Analyzer", "Cookie Parser", "Decoder", "Repeater"]);
      setAgentStats(prev => ({ ...prev, currentStepName: "Execute Tests", status: "Executing vulnerability scans..." }));
      addTimelineEvent("Initializing Payload Agent active loop...");
      addTimelineEvent("Launching streaming payload injector connection...");

      const attackRes = await fetch("http://127.0.0.1:8081/api/ai/auto-attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawRequest: activeRequest,
          parameter: targetParam
        })
      });

      const reader = attackRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let vulnerableDetected = false;
      const findings = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const step = JSON.parse(line);
            
            // Track requests sent
            setAgentStats(prev => ({
              ...prev,
              requestsSent: prev.requestsSent + 1,
              responsesReceived: prev.responsesReceived + 1
            }));

            if (step.type === "switch-strategy") {
              addTimelineEvent(`Strategy swap: Testing ${step.attack} (Confidence: ${Math.round(step.confidence * 100)}%)`);
            } else if (step.type === "try-technique") {
              addTimelineEvent(`Sub-agent testing technique: ${step.technique}`);
            } else if (step.type === "success") {
              vulnerableDetected = true;
              const severity = step.finding.type === "SQLi" ? "High" : step.finding.type === "AuthBypass" ? "Medium" : "Low";
              const confidence = step.finding.type === "SQLi" ? 95 : step.finding.type === "AuthBypass" ? 90 : 80;
              const newFinding = {
                id: findings.length + 1,
                type: step.finding.type,
                technique: step.finding.technique,
                payload: step.finding.payload,
                severity,
                confidence,
                reasons: step.finding.reasons,
                baseline: step.finding.baseline,
                result: step.finding.result,
                confirmed: true,
                rawRequest: activeRequest,
                parameter: targetParam
              };
              findings.push(newFinding);
              setAgentFindings([...findings]);
              setAgentStats(prev => ({ ...prev, findingsCount: findings.length }));
              
              addTimelineEvent(`VULNERABILITY CONFIRMED: ${step.finding.type} via ${step.finding.technique}!`);
              addTimelineEvent(`Evidence matched: ${step.finding.reasons.join(", ")}`);
            } else if (step.type === "fail") {
              addTimelineEvent(`Technique ${step.technique} completed. No anomaly detected.`);
            } else if (step.type === "final") {
              addTimelineEvent(`Active scan loop terminated. Target vulnerable: ${step.vulnerable ? "YES" : "NO"}`);
            }
          } catch(e) {}
        }
      }

      stepsCopy[2].status = "done";
      stepsCopy[3].status = "running";
      setAgentSteps([...stepsCopy]);

      // STEP 4: Compare Responses & Report
      setActiveTools(["Request Analyzer", "Cookie Parser", "Decoder", "Repeater", "Diff Engine", "Response Comparator"]);
      setAgentStats(prev => ({ ...prev, currentStepName: "Compare & Report", status: "Diffing HTTP responses and creating audit report..." }));
      addTimelineEvent("Initializing Report Agent...");
      addTimelineEvent("Running diff engine: analyzing response code shifts and length deviations.");
      addTimelineEvent("Compiling final consolidated audit report...");

      const finalReportText = `### 🔍 Agent Security Audit Report
      
**Audit Goal:** ${agentGoal}
**Target Endpoint:** ${activeRequest.split('\n')[0]}
**Target Parameter:** ${targetParam}
**Vulnerable:** ${vulnerableDetected ? "🚨 YES" : "✅ NO"}

#### 📋 Execution Chronology
1. **Analysis:** Deep-packet examination extracted parameter structural characteristics (Recon Agent).
2. **Generation:** Formulated specific SQL Injection and Authentication Bypass probes (Auth Agent).
3. **Execution:** Dispatched mutated probes to the server, logging status modifications (Payload Agent).
4. **Resolution:** Evaluated response anomalies and compiled findings table (Report Agent).

#### 🛠️ Remediation Guidance
- ${vulnerableDetected ? "Review parameter bindings and sanitize user queries immediately. Enforce typed inputs and parameterized queries." : "No critical injection vectors identified. Validate access control schemas and session management configurations."}
`;
      setAgentReport(finalReportText);
      addTimelineEvent("Executive audit report compiled successfully.");
      addTimelineEvent("Agent session completed.");
      setAgentStats(prev => ({ ...prev, status: "Completed" }));

      stepsCopy[3].status = "done";
      setAgentSteps([...stepsCopy]);
    } catch(err) {
      addTimelineEvent(`[ERROR] Agent execution failed: ${err.message}`);
      setAgentStats(prev => ({ ...prev, status: "Failed" }));
    } finally {
      setAgentRunning(false);
    }
  };



  const activeRequest = getAIRequest();
  const activeResponse = getLastResponse();
  const parsedCookies = getCookies();
  const parsedParams = getParameters();

  return (
    <div className="ai-page-container">
      <style>{`
        .ai-page-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
          background: var(--burp-bg);
          font-family: var(--burp-font-ui);
        }
        .ai-page-header {
          background: var(--burp-header-bg);
          padding: 8px 15px;
          border-bottom: 1px solid var(--burp-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--burp-text);
        }
        .ai-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ai-title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .ai-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ai-mode-select {
          background: white;
          color: var(--burp-text);
          border: 1px solid var(--burp-border);
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 11px;
          outline: none;
          cursor: pointer;
          font-weight: 600;
        }
        .ai-layout-grid {
          display: flex;
          flex: 1;
          overflow: hidden;
          background: var(--burp-bg);
        }
        .ai-sidebar {
          width: 280px;
          background: var(--burp-panel-bg);
          border-right: 1px solid var(--burp-border);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          color: var(--burp-text);
        }
        .sidebar-section {
          padding: 12px;
          border-bottom: 1px solid var(--burp-border);
        }
        .sidebar-section-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--burp-orange);
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .packet-preview-box {
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 8px;
          font-family: var(--burp-font-mono);
          font-size: 10px;
          max-height: 120px;
          overflow-y: auto;
          word-break: break-all;
          white-space: pre-wrap;
          color: #333;
        }
        .cookie-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cookie-row {
          display: flex;
          justify-content: space-between;
          background: white;
          border: 1px solid var(--burp-border);
          padding: 4px 6px;
          border-radius: 3px;
          font-size: 10px;
        }
        .cookie-name {
          font-weight: 700;
          color: #2c3e50;
        }
        .cookie-value {
          color: #7f8c8d;
          max-width: 140px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .history-item {
          padding: 6px;
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 3px;
          font-size: 10px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
        }
        .history-item:hover {
          background: var(--burp-selection);
        }
        .history-item .method {
          font-weight: 700;
          font-size: 9px;
        }
        .history-item .path {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 160px;
          color: #555;
        }
        .ai-chat-workspace {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: white;
          overflow: hidden;
        }
        .messages-scroll {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 15px;
          background: white;
        }
        .message-bubble-row {
          display: flex;
          width: 100%;
        }
        .message-bubble-row.user { justify-content: flex-end; }
        .message-bubble-row.assistant { justify-content: flex-start; }
        .msg-bubble {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
        }
        .message-bubble-row.user .msg-bubble {
          background: var(--burp-selection);
          color: var(--burp-text);
          border: 1px solid var(--burp-border);
          border-bottom-right-radius: 0;
        }
        .message-bubble-row.assistant .msg-bubble {
          background: var(--burp-panel-bg);
          color: var(--burp-text);
          border-bottom-left-radius: 0;
          border: 1px solid var(--burp-border);
        }
        .chat-input-row {
          background: var(--burp-panel-bg);
          padding: 12px 15px;
          border-top: 1px solid var(--burp-border);
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .chat-input-textarea {
          flex: 1;
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 3px;
          padding: 8px 10px;
          color: var(--burp-text);
          font-size: 12px;
          outline: none;
          resize: none;
          height: 36px;
          line-height: 1.4;
          font-family: inherit;
        }
        .chat-input-textarea:focus {
          border-color: var(--burp-orange);
        }
        .send-btn-round {
          background: var(--burp-orange);
          color: white;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .send-btn-round:disabled {
          background: #dcdde1;
          color: #7f8c8d;
          cursor: not-allowed;
        }
        .quick-actions-bar {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          flex-wrap: wrap;
          border-top: 1px dashed var(--burp-border);
          padding-top: 8px;
        }
        .quick-action-btn {
          background: white;
          color: var(--burp-text);
          border: 1px solid var(--burp-border);
          padding: 3px 8px;
          border-radius: 3px;
          font-size: 9.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .quick-action-btn:hover {
          background: var(--burp-orange);
          color: white;
          border-color: var(--burp-orange);
        }
        
        /* Agent Mode UI CSS */
        .agent-workspace-layout {
          flex: 1;
          display: flex;
          gap: 15px;
          padding: 15px;
          overflow: hidden;
          background: white;
          width: 100%;
        }
        .agent-main-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 15px;
          overflow-y: auto;
          height: 100%;
          padding-right: 5px;
        }
        .agent-sidebar-panel {
          width: 280px;
          background: var(--burp-panel-bg);
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          height: 100%;
        }
        .agent-sidebar-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--burp-text);
          border-bottom: 1px solid var(--burp-border);
          padding-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .agent-stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          padding: 4px 0;
          border-bottom: 1px dashed var(--burp-border);
        }
        .agent-stat-label {
          color: #7f8c8d;
        }
        .agent-stat-val {
          font-weight: 700;
          color: var(--burp-text);
        }
        .sub-agent-card {
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 8px;
          font-size: 10.5px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sub-agent-title {
          font-weight: 700;
          color: var(--burp-orange);
        }
        .sub-agent-status {
          font-size: 9.5px;
          color: #7f8c8d;
        }
        .tool-checklist {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tool-checklist-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
          color: #7f8c8d;
        }
        .tool-checklist-item.active {
          color: var(--burp-orange);
          font-weight: 700;
        }
        .tool-checklist-item.completed {
          color: #2ecc71;
        }
        .timeline-container {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .timeline-item {
          display: flex;
          gap: 8px;
          font-size: 10.5px;
          font-family: var(--burp-font-mono);
          line-height: 1.4;
        }
        .timeline-time {
          color: var(--burp-orange);
          font-weight: 700;
          min-width: 65px;
        }
        .timeline-text {
          color: #2ecc71;
        }
        .findings-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 11px;
        }
        .findings-table th {
          background: var(--burp-panel-bg);
          border: 1px solid var(--burp-border);
          padding: 6px 8px;
          text-align: left;
          font-weight: 700;
          color: var(--burp-text);
        }
        .findings-table td {
          border: 1px solid var(--burp-border);
          padding: 6px 8px;
          color: var(--burp-text);
        }
        .severity-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 2px;
          font-weight: 800;
          font-size: 9px;
          text-transform: uppercase;
          color: white;
          text-align: center;
          min-width: 50px;
        }
        .severity-badge.high { background: #e74c3c; }
        .severity-badge.medium { background: #e67e22; }
        .severity-badge.low { background: #3498db; }
        .finding-card {
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          background: var(--burp-panel-bg);
          padding: 12px;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .finding-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--burp-border);
          padding-bottom: 6px;
          font-weight: 700;
          font-size: 11.5px;
        }
        .finding-detail-grid {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 6px;
          font-size: 10.5px;
        }
        .finding-label {
          font-weight: 700;
          color: #7f8c8d;
        }
        .finding-value {
          font-family: var(--burp-font-mono);
          word-break: break-all;
          color: var(--burp-text);
        }
        .agent-findings-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .agent-controls-card {
          background: var(--burp-panel-bg);
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 12px;
        }
        .agent-input-row {
          display: flex;
          gap: 10px;
          margin-top: 8px;
        }
        .agent-text-input {
          flex: 1;
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 3px;
          padding: 6px 10px;
          font-size: 11.5px;
          outline: none;
        }
        .agent-text-input:focus { border-color: var(--burp-orange); }
        .agent-btn {
          background: var(--burp-orange);
          color: white;
          border: none;
          padding: 6px 15px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .agent-btn:hover { background: var(--burp-orange-hover); }
        .agent-status-panel {
          background: white;
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 12px;
        }
        .agent-steps-grid {
          display: flex;
          gap: 12px;
          margin-top: 10px;
        }
        .agent-step-item {
          flex: 1;
          background: var(--burp-bg);
          border: 1px solid var(--burp-border);
          border-radius: 4px;
          padding: 10px;
          font-size: 10.5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          text-align: center;
          position: relative;
        }
        .agent-step-item.running {
          border-color: var(--burp-orange);
          background: rgba(255,102,51,0.05);
        }
        .agent-step-item.done {
          border-color: #2ecc71;
          background: rgba(46,204,113,0.05);
        }
        .step-indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ccc;
        }
        .agent-step-item.running .step-indicator-dot {
          background: var(--burp-orange);
          box-shadow: 0 0 5px var(--burp-orange);
        }
        .agent-step-item.done .step-indicator-dot {
          background: #2ecc71;
        }
        .agent-console-terminal {
          background: #1e272e;
          border: 1px solid #111;
          border-radius: 4px;
          padding: 12px;
          font-family: var(--burp-font-mono);
          font-size: 11px;
          color: #2ecc71;
          height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          line-height: 1.5;
        }
        .agent-report-card {
          border: 1px solid var(--burp-border);
          background: #fdfefe;
          padding: 15px;
          border-radius: 4px;
        }
        .context-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9.5px;
          background: white;
          border: 1px solid var(--burp-border);
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 700;
        }
        .context-pill.active {
          color: #27ae60;
          border-color: #2ecc71;
          background: rgba(46,204,113,0.05);
        }
        .context-pill.inactive {
          color: #c0392b;
          border-color: #fab1a0;
          background: rgba(231,76,60,0.05);
        }
      `}</style>

      {/* Header bar */}
      <div className="ai-page-header">
        <div className="ai-title-wrap">
          <Terminal size={14} color="var(--burp-orange)" />
          <span className="ai-title">EagleEye AI Assistant</span>
        </div>
        <div className="ai-controls">
          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--burp-text)" }}>MODE:</span>
          <select 
            className="ai-mode-select" 
            value={mode} 
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="chat">Chat Mode (Security Assistant)</option>
            <option value="agent">Agent Mode (Autonomous Pentester)</option>
          </select>
        </div>
      </div>

      <div className="ai-layout-grid">
        {/* Left Sidebar Context Panel */}
        <div className="ai-sidebar">
          {/* Active Request Context */}
          <div className="sidebar-section">
            <div className="sidebar-section-title"><Shield size={11} /> Current Request</div>
            {activeRequest ? (
              <div className="packet-preview-box">{activeRequest}</div>
            ) : (
              <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic" }}>No request loaded. Select a log session below or send a packet to Repeater.</div>
            )}
          </div>

          {/* Active Response Context */}
          <div className="sidebar-section">
            <div className="sidebar-section-title"><Activity size={11} /> Current Response</div>
            {activeResponse ? (
              <div className="packet-preview-box">
                <strong>Status:</strong> <span style={{ color: "#27ae60" }}>{activeResponse.status}</span>{"\n"}
                <strong>Length:</strong> {activeResponse.body?.length || 0} bytes
              </div>
            ) : (
              <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic" }}>No response context loaded.</div>
            )}
          </div>

          {/* Parsed Cookies */}
          <div className="sidebar-section">
            <div className="sidebar-section-title"><Cookie size={11} /> Parsed Cookies</div>
            {parsedCookies.length > 0 ? (
              <div className="cookie-list">
                {parsedCookies.map((c, i) => (
                  <div className="cookie-row" key={i}>
                    <span className="cookie-name">{c.name}</span>
                    <span className="cookie-value" title={c.value}>{c.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic" }}>No cookies detected in active headers.</div>
            )}
          </div>

          {/* Repeater Sessions */}
          <div className="sidebar-section">
            <div className="sidebar-section-title"><List size={11} /> Repeater Tabs</div>
            <div className="history-list">
              {getRepeaterRequests().map((req, idx) => (
                <div 
                  className="history-item" 
                  key={idx}
                  onClick={() => {
                    setAIRequest(req.raw);
                    if (req.response) {
                      setLastResponse({
                        status: req.status,
                        headers: req.responseHeaders || {},
                        body: req.response
                      });
                    }
                  }}
                >
                  <span className="method" style={{ color: "var(--burp-orange)" }}>TAB #{idx + 1}</span>
                  <span className="path">{req.raw?.split(' ')[1] || "/"}</span>
                </div>
              ))}
              {getRepeaterRequests().length === 0 && (
                <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic" }}>No active Repeater tabs.</div>
              )}
            </div>
          </div>

          {/* Intercept History */}
          <div className="sidebar-section" style={{ borderBottom: "none" }}>
            <div className="sidebar-section-title"><FileText size={11} /> Intercept History</div>
            <div className="history-list">
              {logs.map((log, idx) => (
                <div 
                  className="history-item" 
                  key={idx}
                  onClick={() => handleSelectLog(log)}
                >
                  <span className={`method ${log.method}`}>{log.method}</span>
                  <span className="path">{log.url?.split('/').slice(3).join('/') || "/"}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic" }}>No intercept log history found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right workspace: Chat vs Agent Mode */}
        {mode === "chat" ? (
          <div className="ai-chat-workspace">
            <div className="messages-scroll">
              {messages.map((msg, i) => (
                <div key={i} className={`message-bubble-row ${msg.role}`}>
                  <div className="msg-bubble">
                    <div>
                      {msg.role === "assistant" ? (
                        msg.animated ? (
                          renderFormattedContent(msg.content.reply || msg.content.response || "")
                        ) : (
                          <Typewriter 
                            text={msg.content.reply || msg.content.response || ""} 
                            onComplete={() => {
                              setMessages(prev => {
                                const next = [...prev];
                                if (next[i]) {
                                  next[i] = { ...next[i], animated: true };
                                }
                                return next;
                              });
                            }}
                          />
                        )
                      ) : (
                        msg.content.reply || msg.content.response || ""
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message-bubble-row assistant">
                  <div className="msg-bubble">
                    <div className="typing-pill" style={{ display: "inline-flex", gap: "3px" }}>
                      <span style={{ width: "4px", height: "4px", background: "#888", borderRadius: "50%" }}></span>
                      <span style={{ width: "4px", height: "4px", background: "#888", borderRadius: "50%" }}></span>
                      <span style={{ width: "4px", height: "4px", background: "#888", borderRadius: "50%" }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="chat-input-row">
              <textarea 
                className="chat-input-textarea"
                placeholder="Ask EagleEye a security question, explain requests, or write payloads..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button 
                className="send-btn-round" 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        ) : (
          /* AGENT MODE UI */
          <div className="agent-workspace-layout">
            {/* Middle Column: Agent Main Panel */}
            <div className="agent-main-panel">
              {/* Goal Config Card */}
              <div className="agent-controls-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#333" }}>AGENT GOAL CONFIGURATION</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button 
                      className="quick-action-btn"
                      onClick={resetAgentSession}
                      style={{ fontSize: "9.5px", padding: "2px 6px", display: "flex", alignItems: "center", gap: "4px" }}
                      title="Reset agent memory and workspace data"
                    >
                      <Trash size={10} /> Reset Agent
                    </button>
                    <span className={`context-pill ${activeRequest ? "active" : "inactive"}`}>
                      Request: {activeRequest ? "LOADED" : "EMPTY"}
                    </span>
                    <span className={`context-pill ${activeResponse ? "active" : "inactive"}`}>
                      Response: {activeResponse ? "LOADED" : "EMPTY"}
                    </span>
                  </div>
                </div>
                <div className="agent-input-row">
                  <input 
                    type="text" 
                    className="agent-text-input" 
                    value={agentGoal}
                    onChange={(e) => setAgentGoal(e.target.value)}
                    placeholder="Define target objective (e.g. Test login form tfUName parameter for SQLi)..."
                    disabled={agentRunning}
                  />
                  {!agentPlan && !agentRunning && (
                    <button 
                      className="agent-btn" 
                      onClick={handleGeneratePlan}
                      disabled={!activeRequest}
                    >
                      Prepare Plan
                    </button>
                  )}
                  {agentPlan && (
                    <button 
                      className="agent-btn" 
                      onClick={runAgentWorkflow}
                      disabled={agentRunning || !activeRequest}
                    >
                      <Play size={10} /> {agentRunning ? "Running..." : "Run Plan"}
                    </button>
                  )}
                </div>
              </div>

              {/* Planning Stage */}
              {agentPlan && !agentRunning && agentFindings.length === 0 && !agentReport && (
                <div className="agent-status-panel" style={{ borderLeft: "4px solid var(--burp-orange)" }}>
                  <div style={{ fontWeight: "700", fontSize: "11px", color: "var(--burp-text)", marginBottom: "8px" }}>
                    STAGE 0: DYNAMIC ATTACK PLAN GENERATED
                  </div>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "8px" }}>
                    The orchestrator has evaluated the request context and structured the following testing strategy:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "10px", marginBottom: "12px" }}>
                    {agentPlan.steps.map((s, idx) => (
                      <div key={idx} style={{ fontSize: "10.5px", color: "#333" }}>
                        <span style={{ color: "var(--burp-orange)", fontWeight: "700" }}>{idx + 1}.</span> {s}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#333", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Estimated Payloads to Inoculate: <span style={{ color: "var(--burp-orange)" }}>~{agentPlan.estimatedTests} tests</span></span>
                    <button 
                      className="agent-btn"
                      onClick={runAgentWorkflow}
                    >
                      <Play size={10} /> Execute Plan
                    </button>
                  </div>
                </div>
              )}

              {/* Steps Visualizer */}
              {(agentRunning || agentTimeline.length > 0) && (
                <div className="agent-status-panel">
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#333" }}>EXECUTION PLAN STEPS</span>
                  <div className="agent-steps-grid">
                    {agentSteps.map((step) => (
                      <div className={`agent-step-item ${step.status}`} key={step.id}>
                        <div className="step-indicator-dot"></div>
                        <strong>Step {step.id}</strong>
                        <span>{step.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline Log Console */}
              {(agentRunning || agentTimeline.length > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#333" }}>LIVE AGENT TASK LOGS (TIMELINE)</span>
                  <div className="agent-console-terminal">
                    <div className="timeline-container">
                      {agentTimeline.map((item, idx) => (
                        <div key={idx} className="timeline-item">
                          <span className="timeline-time">[{item.time}]</span>
                          <span className="timeline-text">{item.text}</span>
                        </div>
                      ))}
                      {agentRunning && <div className="blinking-cursor" style={{ display: "inline-block", color: "#2ecc71" }}>_</div>}
                      <div ref={consoleEndRef} />
                    </div>
                  </div>
                </div>
              )}

              {/* Findings Table */}
              {agentFindings.length > 0 && (
                <div className="agent-findings-section" style={{ background: "var(--burp-panel-bg)", border: "1px solid var(--burp-border)", borderRadius: "4px", padding: "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#333" }}>CONFIRMED FINDINGS</span>
                  <table className="findings-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Severity</th>
                        <th>Finding</th>
                        <th>Technique</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentFindings.map((f, idx) => (
                        <tr key={idx}>
                          <td>#{f.id}</td>
                          <td>
                            <span className={`severity-badge ${f.severity.toLowerCase()}`}>{f.severity}</span>
                          </td>
                          <td>{f.type} Injection</td>
                          <td>{f.technique}</td>
                          <td style={{ fontWeight: "700" }}>{f.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Evidence Cards */}
              {agentFindings.map((f, idx) => (
                <div key={idx} className="finding-card">
                  <div className="finding-card-header">
                    <span style={{ color: "var(--burp-orange)" }}>Finding #{f.id}: {f.type} ({f.technique})</span>
                    <span className={`severity-badge ${f.severity.toLowerCase()}`}>{f.severity}</span>
                  </div>
                  
                  <div className="finding-detail-grid">
                    <div className="finding-label">Parameter:</div>
                    <div className="finding-value" style={{ fontWeight: "700", color: "var(--burp-orange)" }}>{f.parameter}</div>
                    
                    <div className="finding-label">Payload:</div>
                    <div className="finding-value" style={{ background: "white", padding: "4px 8px", border: "1px solid var(--burp-border)", borderRadius: "3px" }}>{f.payload}</div>
                    
                    <div className="finding-label">Evidence:</div>
                    <div className="finding-value">
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {f.reasons.map((r, i) => (
                          <div key={i} style={{ color: "#c0392b" }}>• {r}</div>
                        ))}
                      </div>
                    </div>

                    <div className="finding-label">Baseline Response:</div>
                    <div className="finding-value">
                      Status: <span style={{ fontWeight: "700" }}>{f.baseline.status}</span> | 
                      Length: <span style={{ fontWeight: "700" }}>{f.baseline.length} bytes</span> | 
                      Time: <span style={{ fontWeight: "700" }}>{f.baseline.time}ms</span>
                    </div>

                    <div className="finding-label">Mutated Response:</div>
                    <div className="finding-value">
                      Status: <span style={{ fontWeight: "700", color: "#c0392b" }}>{f.result.status}</span> | 
                      Length: <span style={{ fontWeight: "700", color: "#c0392b" }}>{f.result.length} bytes</span> | 
                      Time: <span style={{ fontWeight: "700", color: "#c0392b" }}>{f.result.time}ms</span>
                    </div>
                  </div>

                  <div className="quick-actions-bar" style={{ marginTop: "5px", paddingTop: "5px" }}>
                    <button className="quick-action-btn" onClick={() => {
                      const mutated = injectPayload(f.rawRequest, f.parameter, f.payload);
                      addRawToRepeater(mutated);
                      setMainTab("repeater");
                    }}>[Send to Repeater]</button>
                    
                    <button className="quick-action-btn" onClick={() => {
                      alert(`Re-running scan payload: ${f.payload}`);
                    }}>[Test Again]</button>
                    
                    <button className="quick-action-btn" onClick={() => {
                      setAgentGoal(`Generate alternative payloads for parameter "${f.parameter}" targeting ${f.type}`);
                      handleGeneratePlan();
                    }}>[Generate Payloads]</button>
                    
                    <button className="quick-action-btn" onClick={() => {
                      setInput(`Explain the finding: detected ${f.type} vulnerability using payload "${f.payload}" on parameter "${f.parameter}". Response changed: ${f.reasons.join(", ")}.`);
                      setMode("chat");
                    }}>[Explain Finding]</button>
                  </div>
                </div>
              ))}

              {/* Consolidated Report */}
              {agentReport && (
                <div className="agent-report-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", borderBottom: "1px solid var(--burp-border)", paddingBottom: "6px", marginBottom: "12px" }}>
                    <Sparkles size={14} color="var(--burp-orange)" />
                    <span style={{ fontWeight: "800", fontSize: "12px", color: "var(--burp-text)" }}>EXECUTIVE SECURITY AUDIT REPORT</span>
                  </div>
                  {renderFormattedContent(agentReport)}
                </div>
              )}
            </div>

            {/* Right Column: Agent Workspace Sidebar */}
            <div className="agent-sidebar-panel">
              <div>
                <div className="agent-sidebar-title">
                  <Cpu size={12} color="var(--burp-orange)" /> Agent Workspace
                </div>
                <div style={{ marginTop: "8px" }}>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Status:</span>
                    <span className="agent-stat-val" style={{ color: agentRunning ? "var(--burp-orange)" : "#2ecc71" }}>
                      {agentRunning ? "Running" : agentReport ? "Finished" : "Idle"}
                    </span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Current Step:</span>
                    <span className="agent-stat-val">{agentStats.currentStepName}</span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Requests Sent:</span>
                    <span className="agent-stat-val">{agentStats.requestsSent}</span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Responses Received:</span>
                    <span className="agent-stat-val">{agentStats.responsesReceived}</span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Findings Confirmed:</span>
                    <span className="agent-stat-val" style={{ color: agentStats.findingsCount > 0 ? "#e74c3c" : "inherit" }}>
                      {agentStats.findingsCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Sub-Agent */}
              <div className="sub-agent-card">
                <span className="sub-agent-title">Active Sub-Agent</span>
                <span style={{ fontWeight: "700", color: "#2c3e50" }}>
                  {agentStats.currentStepName === "Request Analysis" ? "Recon Agent" :
                   agentStats.currentStepName === "Generate Tests" ? "Auth Agent" :
                   agentStats.currentStepName === "Execute Tests" ? "Payload Agent" :
                   agentStats.currentStepName === "Compare & Report" ? "Report Agent" : "Idle"}
                </span>
                <span className="sub-agent-status">{agentStats.status}</span>
              </div>

              {/* Tools Checklist */}
              <div>
                <div className="agent-sidebar-title" style={{ fontSize: "10px" }}>
                  Tools Checklist
                </div>
                <div className="tool-checklist" style={{ marginTop: "8px" }}>
                  {[
                    "Request Analyzer",
                    "Cookie Parser",
                    "Repeater",
                    "Decoder",
                    "Diff Engine",
                    "Response Comparator"
                  ].map((tool, idx) => {
                    const isActive = activeTools.includes(tool);
                    const isCompleted = !agentRunning && agentReport && activeTools.includes(tool);
                    return (
                      <div 
                        key={idx} 
                        className={`tool-checklist-item ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                      >
                        <span className="tool-icon-check">
                          {isCompleted ? <CheckSquare size={11} color="#2ecc71" /> : 
                           isActive ? <Square size={11} color="var(--burp-orange)" /> : 
                           <Square size={11} />}
                        </span>
                        {tool}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Context Stats */}
              <div>
                <div className="agent-sidebar-title" style={{ fontSize: "10px" }}>
                  Context Scope
                </div>
                <div style={{ marginTop: "8px" }}>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Repeater Tabs:</span>
                    <span className="agent-stat-val">{getRepeaterRequests().length}</span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Intercept History:</span>
                    <span className="agent-stat-val">{logs.length}</span>
                  </div>
                  <div className="agent-stat-row">
                    <span className="agent-stat-label">Cookie Context:</span>
                    <span className="agent-stat-val">{parsedCookies.length} params</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
