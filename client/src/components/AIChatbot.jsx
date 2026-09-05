import React, { useState, useEffect, useRef } from "react";
import { Send, Terminal, Sparkles, Trash2, Info, ChevronRight, Zap, Shield, Search, Activity, FileText, List, Lock } from "lucide-react";
import { getAIRequest, getSelectedVuln, setAIRequest, addRawToRepeater, getLastResponse, setRawToIntruder, setIntruderPayloads, getChatHistory, setChatHistory, getRepeaterRequests, setDecoderInput } from "../store";
import MarkdownRenderer from "./MarkdownRenderer";

const injectPayload = (req, param, payload) => {
  const regex = new RegExp(`(${param}=)([^&\\s]*)`, 'i');
  return req.replace(regex, `$1${encodeURIComponent(payload)}`);
};

export default function AIChatbot({ setMainTab }) {
  const [beginnerMode, setBeginnerMode] = useState(false);
  const [messages, setMessages] = useState(getChatHistory());
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const analysisSteps = [
    "Initializing deep packet analysis...",
    "Parsing HTTP method and URL structure...",
    "Extracting parameters and identifying data types...",
    "Mapping attack surface for injection vectors...",
    "Analyzing header entropy and security flags...",
    "Checking for known vulnerability patterns...",
    "Simulating payload execution against context...",
    "Analyzing server-side response behavior...",
    "Synthesizing final technical report..."
  ];

  useEffect(() => {
    let interval;
    if (isLoading) {
      setAnalysisStep(0);
      interval = setInterval(() => {
        setAnalysisStep(prev => (prev < analysisSteps.length - 1 ? prev + 1 : prev));
      }, 1800); // Slower, deeper feel
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Sync with global store whenever messages change
  useEffect(() => {
    setChatHistory(messages);
  }, [messages]);
  
  const commonSuggestions = [
    "Analyze Packet", "Generate SQL injection", "Explain this request", 
    "How to attack this?", "Generate Python exploit script", "Full Attack Automation",
    "Bypass XSS filter", "Check for LFI", "Brute force passwords"
  ];

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (val.length > 1) {
      const filtered = commonSuggestions.filter(s => s.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };
  const [copied, setCopied] = useState(null);
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const currentRequest = getAIRequest();
    const currentVuln = getSelectedVuln();
    const lastResponse = getLastResponse();
    
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: { reply: userMessage, actions: [] } }]);
    setIsLoading(true);

    // ⚡ Smart Command Handling (Client-side - Deep Thinking Mode)
    const lowerMsg = userMessage.toLowerCase();
    
    // We no longer return instant results. Instead, we let the AI "Think" 
    // unless it's a very simple UI command. 
    // This makes the tool feel more deliberate and thorough.
    
    if (lowerMsg === "clear") {
       clearChat();
       return;
    }

    try {
      const response = await fetch("http://127.0.0.1:8081/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          rawRequest: currentRequest,
          selectedVuln: currentVuln,
          lastResponse: lastResponse,
          beginnerMode: beginnerMode,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content.reply }))
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: "assistant", content: data }]);
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: {
          reply: "AI service failed. Using fallback security guidance.",
          actions: [{
            type: "payload",
            label: "Basic Fuzzing",
            parameter: currentVuln?.parameter || "id",
            payloads: ["'\"", "<script>", "../../../etc/passwd"]
          }]
        } 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: { reply: "Chat cleared. I'm still here to help with your security analysis!", actions: [] }
      }
    ]);
  };

  const [expandedReasoning, setExpandedReasoning] = useState({});
  const toggleReasoning = (index) => {
    setExpandedReasoning(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleInsertFlow = (param, payload) => {
    setMessages(prev => [
      ...prev,
      { role: "user", content: { reply: `I want to use this payload: ${payload}`, actions: [] } },
      { 
        role: "assistant", 
        content: { 
          reply: `Understood. I will prepare the injection. Shall I apply this payload to the parameter '${param}' in the current packet?`, 
          actions: [{
            type: "confirm-inject",
            label: "Yes, Inject Now",
            parameter: param,
            payload: payload
          }]
        } 
      }
    ]);
  };

  const handleConfirmInject = (param, payload) => {
    const updated = injectPayload(getAIRequest(), param, payload);
    setAIRequest(updated);
    setMessages(prev => [
      ...prev,
      { 
        role: "assistant", 
        content: { 
          reply: "The packet has been updated with the selected payload. Would you like to switch to the Repeater tab to analyze the server response?", 
          actions: [{
            type: "go-repeater",
            label: "Yes, Go to Repeater",
            updatedRequest: updated
          }]
        } 
      }
    ]);
  };

  const handleAutoAttack = async (param, initialPayloads, label) => {
    setIsLoading(true);
    setAnalysisStep(0);
    
    // Create a unique ID for this message so we can update it in place
    const messageId = Date.now();
    setMessages(prev => [...prev, { 
      id: messageId,
      role: "assistant", 
      content: { 
        type: "agent-thinking",
        label: label,
        parameter: param,
        logs: ["🧠 AI Agent Started: Analyzing attack surface..."],
        confidence: 0.1
      } 
    }]);

    try {
      const response = await fetch("http://127.0.0.1:8081/api/ai/auto-attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawRequest: getAIRequest(),
          parameter: param
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          const step = JSON.parse(line);

          setMessages(prev => prev.map(m => {
            if (m.id !== messageId) return m;

            const newContent = { ...m.content };
            
            if (step.type === "switch-strategy") {
              newContent.logs = [...newContent.logs, `👉 Switching strategy to ${step.attack} (Confidence: ${Math.round(step.confidence * 100)}%)`];
              newContent.confidence = step.confidence;
            } else if (step.type === "try-technique") {
              newContent.logs = [...newContent.logs, `→ Testing technique: ${step.technique}...`];
            } else if (step.type === "success") {
              newContent.logs = [...newContent.logs, `🔥 SUCCESS: Vulnerability confirmed via ${step.finding.technique}!`];
            } else if (step.type === "fail") {
              newContent.logs = [...newContent.logs, `❌ Technique ${step.technique} failed. No anomalies detected.`];
            } else if (step.type === "final") {
              return {
                ...m,
                content: {
                  type: "autonomous-report",
                  label: label,
                  parameter: param,
                  results: step
                }
              };
            }

            return { ...m, content: newContent };
          }));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: { reply: "Autonomous Engine failed: " + err.message, actions: [] } } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  const renderMessageContent = (content, index) => {
    try {
      if (!content) return <div className="chat-text-part">Empty message received from engine.</div>;
      
      // Handle specialized report types first
      
      // 🔥 NEW: Agent Thinking View
      if (content.type === 'agent-thinking') {
        return (
          <div className="agent-thinking-panel" style={{ border: '1px solid var(--burp-border)', borderRadius: '4px', background: '#2d3436', overflow: 'hidden' }}>
            <div style={{ background: '#1e272e', padding: '10px 15px', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Activity size={14} color="var(--burp-orange)" className="pulse-animation" />
                  <span style={{ fontSize: '11px', fontWeight: '800', color: 'white', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Agent: Autonomous Execution</span>
               </div>
               <div style={{ fontSize: '10px', color: '#ffab91', fontWeight: '800' }}>
                  CONFIDENCE: {Math.round((content.confidence || 0) * 100)}%
               </div>
            </div>
            
            <div style={{ height: '4px', width: '100%', background: '#111' }}>
               <div style={{ height: '100%', width: `${(content.confidence || 0) * 100}%`, background: 'var(--burp-orange)', transition: 'width 0.5s ease-out' }}></div>
            </div>

            <div className="agent-logs" style={{ padding: '15px', maxHeight: '200px', overflowY: 'auto', background: '#000', fontFamily: 'var(--burp-font-mono)', fontSize: '11px', color: '#2ecc71', lineHeight: '1.6' }}>
               {content.logs.map((log, i) => (
                 <div key={i} style={{ marginBottom: '4px', opacity: i === content.logs.length - 1 ? 1 : 0.6 }}>
                    {log.startsWith('👉') || log.startsWith('🧠') ? <span style={{color: 'var(--burp-orange)'}}>{log}</span> : log}
                 </div>
               ))}
               <div ref={messagesEndRef} />
            </div>
          </div>
        );
      }

      // 🔥 NEW: Autonomous Report View
      if (content.type === 'autonomous-report') {
        const { label, parameter, results } = content;
        const memory = results.memory || { tried: [], failed: [], successful: [] };
        const plan = results.plan || [];

        return (
          <div className="autonomous-report-panel" style={{ border: '1px solid var(--burp-border)', borderRadius: '4px', background: 'white', overflow: 'hidden' }}>
            <div style={{ background: 'var(--burp-header-bg)', padding: '8px 12px', borderBottom: '1px solid var(--burp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={14} color="var(--burp-orange)" />
                <span style={{ fontWeight: '700', fontSize: '11px', color: '#2c3e50', textTransform: 'uppercase' }}>Autonomous Security Audit Report</span>
              </div>
              <div style={{ background: '#27ae60', color: 'white', fontSize: '9px', fontWeight: '900', padding: '2px 8px', borderRadius: '10px' }}>COMPLETE</div>
            </div>

            {/* Confidence Scores Dashboard */}
            <div style={{ padding: '15px', background: 'var(--burp-panel-bg)', borderBottom: '1px solid var(--burp-border)' }}>
               <div style={{ fontSize: '10px', fontWeight: '800', color: '#666', marginBottom: '12px', textTransform: 'uppercase' }}>Vulnerability Confidence Matrix</div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {plan.map((p, i) => (
                    <div key={i} style={{ background: 'white', padding: '10px', border: '1px solid var(--burp-border)', borderRadius: '4px', textAlign: 'center' }}>
                       <div style={{ fontSize: '9px', color: '#888', fontWeight: '800', marginBottom: '5px' }}>{p.type}</div>
                       <div style={{ fontSize: '14px', fontWeight: '900', color: p.confidence > 0.5 ? 'var(--burp-orange)' : '#2c3e50' }}>
                          {Math.round(p.confidence * 100)}%
                       </div>
                       <div style={{ height: '3px', width: '100%', background: '#eee', marginTop: '8px', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${p.confidence * 100}%`, background: p.confidence > 0.5 ? 'var(--burp-orange)' : '#95a5a6' }}></div>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Agent Memory Summary */}
            <div style={{ padding: '12px', borderBottom: '1px solid var(--burp-border)', background: '#fcfcfc' }}>
               <div style={{ fontSize: '10px', fontWeight: '800', color: '#666', marginBottom: '10px', textTransform: 'uppercase' }}>Agent Execution Memory</div>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {memory.failed.map((f, i) => (
                    <div key={i} style={{ fontSize: '9px', background: '#f5f5f5', color: '#999', padding: '3px 8px', borderRadius: '3px', border: '1px solid #eee' }}>
                       {f.attack}:{f.technique} ❌
                    </div>
                  ))}
                  {memory.successful.map((s, i) => (
                    <div key={i} style={{ fontSize: '9px', background: 'rgba(39, 174, 96, 0.1)', color: '#27ae60', padding: '3px 8px', borderRadius: '3px', border: '1px solid #2ecc71', fontWeight: '700' }}>
                       {s.attack}:{s.technique} 🔥
                    </div>
                  ))}
               </div>
            </div>
            
            {/* Detailed Findings */}
            <div className="findings-list" style={{ padding: '15px' }}>
               {!results.vulnerable ? (
                 <div style={{ textAlign: 'center', padding: '20px', color: '#95a5a6' }}>
                    <Shield size={32} style={{ opacity: 0.2, marginBottom: '10px' }} />
                    <div style={{ fontSize: '12px', fontWeight: '700' }}>No Vulnerabilities Confirmed</div>
                    <p style={{ fontSize: '10px', marginTop: '5px' }}>Agent explored all planned vectors but detected no significant anomalies.</p>
                 </div>
               ) : (
                 results.findings.map((finding, idx) => (
                   <div key={idx} className="finding-item" style={{ border: '1px solid var(--burp-border)', borderRadius: '3px', marginBottom: '15px' }}>
                      <div style={{ background: '#fff5f5', padding: '6px 12px', borderBottom: '1px solid #fab1a0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: '10px', fontWeight: '900', color: '#c0392b' }}>EXPLOIT CONFIRMED: {finding.type} ({finding.technique})</span>
                         <Zap size={12} color="#ff6633" />
                      </div>
                      <div style={{ padding: '12px' }}>
                         <code style={{ fontFamily: 'var(--burp-font-mono)', fontSize: '11px', background: '#f8f9fa', padding: '8px', border: '1px solid #eee', display: 'block', wordBreak: 'break-all', marginBottom: '10px' }}>
                            {finding.payload}
                         </code>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {finding.reasons.map((r, i) => (
                               <div key={i} style={{ fontSize: '11px', color: '#27ae60', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <ChevronRight size={10} /> {r}
                               </div>
                            ))}
                         </div>
                         <div style={{ marginTop: '15px', display: 'flex', gap: '8px' }}>
                            <button className="toolbar-btn primary" style={{ flex: 1, padding: '4px', fontSize: '10px', background: 'var(--burp-orange)' }} onClick={() => handleInsertFlow(parameter, finding.payload)}>Verify Manually</button>
                            <button className="toolbar-btn" style={{ flex: 1, padding: '4px', fontSize: '10px' }} onClick={() => {
                               const updated = injectPayload(getAIRequest(), parameter, finding.payload);
                               addRawToRepeater(updated);
                               setMainTab('repeater');
                            }}>Send to Repeater</button>
                         </div>
                      </div>
                   </div>
                 ))
               )}
            </div>
          </div>
        );
      }

      // Handle standard chat responses
      const reply = content.reply || (typeof content === 'string' ? content : null);
      const actions = Array.isArray(content.actions) ? content.actions : [];
      const reasoning = content.reasoning;

      return (
        <div className="chat-reply">
          <div className="chat-text-part">
             {reply ? (
               <MarkdownRenderer content={reply} />
             ) : (
               <div style={{ color: '#ff6633', fontSize: '11px', background: 'rgba(255,102,51,0.1)', padding: '10px', borderRadius: '4px' }}>
                 <strong>[ENGINE ERROR]</strong> No reply field found in response. 
                 <div style={{ fontSize: '10px', marginTop: '5px', opacity: 0.8 }}>Received: {JSON.stringify(content)}</div>
               </div>
             )}
          </div>

          {reasoning && (
            <div className="thinking-dropdown-container" style={{ margin: '12px 0' }}>
              <div 
                className="thinking-toggle" 
                onClick={() => toggleReasoning(index)}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  fontSize: '11px', 
                  color: '#b2bec3', 
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'all 0.2s'
                }}
              >
                 <Activity size={12} color={expandedReasoning[index] ? "#ffab91" : "#95a5a6"} />
                 <span style={{ fontWeight: '600' }}>{expandedReasoning[index] ? "Hide Thinking Process" : "Show Thinking Process"}</span>
                 <ChevronRight size={12} style={{ transform: expandedReasoning[index] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </div>
              
              {expandedReasoning[index] && (
                <div className="thinking-content" style={{ 
                  marginTop: '10px', 
                  padding: '12px', 
                  background: 'rgba(0,0,0,0.15)', 
                  borderRadius: '6px', 
                  fontSize: '11px', 
                  color: '#95a5a6', 
                  lineHeight: '1.6',
                  borderLeft: '2px solid #ffab91',
                  fontFamily: 'monospace'
                }}>
                  {reasoning}
                </div>
              )}
            </div>
          )}

          {actions && actions.length > 0 && (
            <div className="chat-actions-container" style={{ marginTop: '15px' }}>
              {actions.map((rawAction, i) => {
                if (!rawAction) return null;
                const action = {
                  label: rawAction.label || rawAction.type || "Analysis Result",
                  type: (rawAction.type === 'payload' || rawAction.payloads) ? 'payload' : (rawAction.type || 'payload'),
                  parameter: rawAction.parameter || "fuzz",
                  payloads: Array.isArray(rawAction.payloads) ? rawAction.payloads.map(p => typeof p === 'string' ? p : JSON.stringify(p)) : []
                };

                return (
                  <div key={i} className="payload-gen-card" style={{ marginBottom: '10px' }}>
                    <div className="gen-card-header">
                      <Zap size={14} /> 
                      <span>{action.label}</span>
                      <button 
                        className="msg-action-btn" 
                        style={{ marginLeft: 'auto', background: '#ff6633', color: 'white', border: 'none', padding: '2px 8px' }}
                        onClick={() => handleAutoAttack(action.parameter, action.payloads, action.label)}
                      >
                        Run Auto Attack
                      </button>
                    </div>
                    <div className="gen-card-body">
                      {action.parameter && action.parameter !== 'fuzz' && (
                        <div className="target-info">Target Parameter: <code>{action.parameter}</code></div>
                      )}
                      
                      {action.type === 'payload' && action.payloads && action.payloads.length > 0 && (
                        <div className="payload-list">
                          {action.payloads.map((p, idx) => (
                            <div key={idx} className="payload-item-row">
                              <div className="payload-text">{p}</div>
                              <div className="payload-actions">
                                <button onClick={() => handleInsertFlow(action.parameter, p)}>Insert</button>
                                <button onClick={() => {
                                  const updated = injectPayload(getAIRequest(), action.parameter, p);
                                  addRawToRepeater(updated);
                                  setMainTab('repeater');
                                }}>Repeater</button>
                                <button onClick={() => {
                                  setRawToIntruder(getAIRequest());
                                  setIntruderPayloads(action.payloads);
                                  setMainTab('intruder');
                                }}>Intruder</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {action.type === 'suggestion' && (
                        <div style={{ marginTop: '10px' }}>
                           <button className="sidebar-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setInput(action.label)}>
                              Execute: {action.label}
                           </button>
                        </div>
                      )}

                      {rawAction.type === 'confirm-inject' && (
                        <div style={{ marginTop: '10px' }}>
                           <button className="sidebar-btn" style={{ width: '100%', justifyContent: 'center', background: '#27ae60', color: 'white' }} onClick={() => handleConfirmInject(rawAction.parameter, rawAction.payload)}>
                              <Zap size={14} /> {rawAction.label}
                           </button>
                        </div>
                      )}

                      {rawAction.type === 'go-repeater' && (
                        <div style={{ marginTop: '10px' }}>
                           <button className="sidebar-btn" style={{ width: '100%', justifyContent: 'center', background: '#ff6633', color: 'white' }} onClick={() => {
                              addRawToRepeater(rawAction.updatedRequest);
                              setMainTab('repeater');
                           }}>
                              <Send size={14} /> {rawAction.label}
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    } catch (e) {
      console.error("CRITICAL RENDERING ERROR:", e);
      return (
        <div style={{ color: '#e74c3c', background: 'rgba(231,76,60,0.1)', padding: '15px', borderRadius: '8px', border: '1px solid #e74c3c' }}>
          <div style={{ fontWeight: '800', marginBottom: '5px' }}>⚠️ CHAT RENDERING CRASHED</div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>The AI response contained data that the UI couldn't process.</div>
          <div style={{ fontSize: '10px', marginTop: '10px', fontFamily: 'monospace', color: '#95a5a6' }}>Error: {e.message}</div>
        </div>
      );
    }
  };

  const [showPacketModal, setShowPacketModal] = useState(false);
  const [tempSelectedIndex, setTempSelectedIndex] = useState(-1);

  return (
    <div className="ai-chatbot-container">
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <Terminal size={14} /> Quick Actions
        </div>
        <div className="sidebar-actions">
          <button className="sidebar-btn" onClick={() => {
            setShowPacketModal(true);
            setTempSelectedIndex(-1);
          }} style={{ background: 'rgba(255, 102, 51, 0.1)', color: 'var(--burp-orange)', border: '1px solid rgba(255, 102, 51, 0.3)' }}>
            <List size={13} /> Choose Packet
          </button>
          <button className="sidebar-btn" onClick={() => setInput("Can you analyze the current packet for potential vulnerabilities?")}>
            <Search size={13} /> Analyze Packet
          </button>
          <button className="sidebar-btn" onClick={() => setInput("sql")}>
            <Zap size={13} /> SQL Templates
          </button>
          <button className="sidebar-btn" onClick={() => setInput("What are the security implications of the headers in this request?")}>
            <Info size={13} /> Header Analysis
          </button>
          <button className="sidebar-btn" onClick={() => setInput("Suggest some advanced payloads to bypass XSS filters for this endpoint.")}>
            <Zap size={13} /> Bypass Suggestions
          </button>
        </div>

        <div className="context-card" style={{ marginTop: '20px' }}>
          <div className="context-header" style={{ justifyContent: 'space-between' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={12} /> Options</div>
             <div className={`beginner-toggle ${beginnerMode ? 'active' : ''}`} onClick={() => setBeginnerMode(!beginnerMode)}>
                <div className="toggle-slider"></div>
             </div>
          </div>
          <div className="context-body">
             <div style={{ fontSize: '10px', color: '#b2bec3', marginBottom: '8px' }}>
                Beginner Mode: <strong>{beginnerMode ? 'ON' : 'OFF'}</strong>
             </div>
             <p style={{ fontSize: '9px', opacity: 0.8 }}>Simplified explanations for security concepts.</p>
          </div>
        </div>
        
        <div className="context-card">
          <div className="context-header"><Shield size={12} /> Active Context</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {getAIRequest() ? (
                 <div className="context-status positive">Packet Loaded</div>
              ) : (
                 <div className="context-status negative">No Packet</div>
              )}
              {getLastResponse() ? (
                 <div className="context-status positive" style={{ background: 'rgba(52, 152, 219, 0.2)', color: '#3498db' }}>Response Ready</div>
              ) : (
                 <div className="context-status negative">No Response</div>
              )}
            </div>
            
            {getSelectedVuln() && (
              <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', color: '#ff6633', fontWeight: '800', marginBottom: '4px' }}>TARGET VULNERABILITY</div>
                <div style={{ fontSize: '11px', color: 'white', fontWeight: '700' }}>{getSelectedVuln().name}</div>
                <div style={{ fontSize: '10px', color: '#95a5a6', marginTop: '4px' }}>Parameter: <code style={{color: '#ffab91'}}>{getSelectedVuln().parameter}</code></div>
              </div>
            )}
          </div>

        <button className="clear-chat-btn" onClick={clearChat}>
          <Trash2 size={13} /> Clear History
        </button>
      </div>

      {/* --- CHOOSE PACKET MODAL --- */}
      {showPacketModal && (
        <div className="ai-modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowPacketModal(false)}>
           <div className="ai-modal-content" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
              <div className="ai-modal-header" style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <List size={18} color="var(--burp-orange)" />
                    <h3 style={{ margin: 0, fontSize: '14px', color: 'white' }}>Select Source Packet</h3>
                 </div>
                 <button onClick={() => setShowPacketModal(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>
                    <Search size={16} />
                 </button>
              </div>
              
              <div style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                 <div style={{ fontSize: '11px', color: '#95a5a6', marginBottom: '15px' }}>
                    Choose a request from your Repeater sessions to analyze with EagleEye Intelligence.
                 </div>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {getRepeaterRequests().map((req, idx) => (
                       <div 
                         key={idx} 
                         onClick={() => setTempSelectedIndex(idx)}
                         style={{ 
                            padding: '12px', 
                            background: tempSelectedIndex === idx ? 'rgba(255, 102, 51, 0.15)' : 'rgba(255,255,255,0.03)', 
                            border: tempSelectedIndex === idx ? '1px solid var(--burp-orange)' : '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                         }}
                       >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                             <span style={{ fontSize: '11px', fontWeight: '800', color: tempSelectedIndex === idx ? 'var(--burp-orange)' : 'white' }}>
                                Session #{idx + 1}
                             </span>
                             <span style={{ fontSize: '10px', color: '#2ecc71', fontWeight: '700' }}>{req.raw.split(' ')[0]}</span>
                          </div>
                          <code style={{ fontSize: '10px', color: '#95a5a6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                             {req.raw.match(/Host: ([^\n\r]+)/i)?.[1] || 'Unknown Host'}{req.raw.split(' ')[1]}
                          </code>
                       </div>
                    ))}

                    {getRepeaterRequests().length === 0 && (
                       <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
                          No Repeater sessions found. Send a request to Repeater first.
                       </div>
                    )}
                 </div>
              </div>

              <div style={{ padding: '15px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                 <button className="sidebar-btn" onClick={() => setShowPacketModal(false)} style={{ margin: 0, padding: '6px 15px' }}>Cancel</button>
                 <button 
                   className="ai-btn-primary" 
                   disabled={tempSelectedIndex === -1}
                   onClick={() => {
                      const selectedRaw = getRepeaterRequests()[tempSelectedIndex].raw;
                      setAIRequest(selectedRaw);
                      setMessages(prev => [...prev, { 
                        role: "assistant", 
                        content: { reply: `Context updated to Repeater Session #${tempSelectedIndex + 1}. You can now use 'Analyze Packet' to start the security audit.`, actions: [] } 
                      }]);
                      setShowPacketModal(false);
                   }}
                   style={{ margin: 0, padding: '6px 20px', background: 'var(--burp-orange)' }}
                 >
                    Apply Packet
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="chat-main">
        <div className="chat-header">
          <div className="ai-brand">
            <div className="ai-avatar"><Terminal size={18} /></div>
            <div>
              <div className="ai-name">EagleEye Intelligence Chat</div>
              <div className="ai-status">Ready to assist</div>
            </div>
          </div>
          <div className="chat-stats">
            <div className="stat-pill"><Sparkles size={10} /> GPT-4o Mini</div>
          </div>
        </div>

        <div className="messages-container">
          {messages.map((msg, i) => (
            <div key={i} className={`message-wrapper ${msg.role}`}>
              <div className="message-icon">
                {msg.role === 'assistant' ? <Terminal size={16} /> : <Activity size={16} />}
              </div>
              <div className="message-bubble">
                <div className="message-content">
                  {renderMessageContent(msg.content, i)}
                </div>
                {msg.role === 'assistant' && (
                  <div className="message-actions-bar">
                    <button className="msg-action-btn" onClick={() => { addRawToRepeater(getAIRequest()); setMainTab('repeater'); }}>
                       <Send size={10} /> Repeater
                    </button>
                    <button className="msg-action-btn" onClick={() => { setRawToIntruder(getAIRequest()); setMainTab('intruder'); }}>
                       <Zap size={10} /> Intruder
                    </button>
                    <button className="msg-action-btn" onClick={() => { setDecoderInput(msg.content.reply); setMainTab('decoder'); }}>
                       <Lock size={10} /> Decoder
                    </button>
                    <button className="msg-action-btn" onClick={() => copyToClipboard(msg.content.reply, `msg-${i}`)}>
                       {copied === `msg-${i}` ? <Shield size={10} /> : <FileText size={10} />} {copied === `msg-${i}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <div className="message-time">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper assistant">
              <div className="message-icon"><Terminal size={16} /></div>
              <div className="message-bubble loading">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#ffab91', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <Activity size={12} className="spin" /> {analysisSteps[analysisStep]}
                  </div>
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          {suggestions.length > 0 && (
            <div className="input-suggestions">
              {suggestions.map((s, i) => (
                <div key={i} className="suggestion-item" onClick={() => { setInput(s); setSuggestions([]); }}>
                  {s}
                </div>
              ))}
            </div>
          )}
          <div className="input-wrapper">
            <textarea 
              placeholder="Ask anything about the request or security..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button 
              className={`send-btn ${input.trim() ? 'active' : ''}`} 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </div>
          <div className="input-footer">
            Press Enter to send, Shift + Enter for new line. Powered by EagleEye AI.
          </div>
        </div>
      </div>
    </div>
  );
}
