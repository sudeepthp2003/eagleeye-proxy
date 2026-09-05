import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Activity, Zap, Info, Send, Search, Terminal, AlertTriangle, ChevronRight, List, Shield, Play, ExternalLink, FileText } from "lucide-react";
import { getAIRequest, setAIResult, getAIResult, setAIRequest, addRawToRepeater, setRawToIntruder, setSelectedVuln } from "../store";

export default function AIAnalysis({ setMainTab }) {
  const [rawRequest, setRawRequest] = useState(getAIRequest() || "POST /login HTTP/1.1\nHost: localhost\nContent-Type: application/x-www-form-urlencoded\n\ntfUName=admin&tfUPass=123");
  const [result, setResult] = useState(getAIResult());
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [activeResultTab, setActiveResultTab] = useState("overview");

  // Attack Engine State
  const [selectedVuln, setSelectedVuln] = useState(null);
  const [attackPayloads, setAttackPayloads] = useState([]);
  const [attackResults, setAttackResults] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [attackVariant, setAttackVariant] = useState("default");
  const [payloadPreview, setPayloadPreview] = useState("");
  const [baseline, setBaseline] = useState(null);

  // Chat/Panel State
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const chatEndRef = useRef(null);

  // Resizing
  const [dividerPos, setDividerPos] = useState(40);
  const [isResizingDivider, setIsResizingDivider] = useState(false);
  const workspaceRef = useRef(null);

  useEffect(() => {
    if (activeResultTab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, activeResultTab]);

  useEffect(() => {
    setAIRequest(rawRequest);
  }, [rawRequest]);

  useEffect(() => {
    setSelectedVuln(selectedVuln);
  }, [selectedVuln]);

  const runDeepAnalysis = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setResult(null);
    setAIResult(null);
    setSelectedVuln(null);
    setAttackPayloads([]);
    setProgress(0);
    setStatus("EagleEye: Initializing Interactive Attack Engine...");

    const intv = setInterval(() => setProgress(p => Math.min(p + 1, 99)), 80);

    try {
      const res = await fetch("http://127.0.0.1:8081/api/ai/deep-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawRequest })
      });
      const data = await res.json();
      setResult(data);
      setAIResult(data);
      setStatus("Vulnerability Mapping Complete");
      setActiveResultTab("vulns");
    } catch (err) {
      setStatus("Engine Error: " + err.message);
    } finally {
      clearInterval(intv);
      setIsLoading(false);
    }
  };

  const handleTechnique = async (type) => {
    if (!selectedVuln || isGenerating) return;
    console.log(`[FRONTEND] Triggering generation for: ${type}`);
    setAttackVariant(type);
    setIsGenerating(true);
    setErrorMessage("");
    setAttackPayloads([]);
    
    try {
      const apiUrl = `http://${window.location.hostname}:8081/api/ai/generate-payloads`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attackType: selectedVuln.name,
          technique: type,
          parameter: selectedVuln.parameter,
          request: rawRequest
        })
      });
      
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.details || errData.error || "Generation failed at server");
      }

      const data = await res.json();
      console.log(`[FRONTEND] Received ${data.payloads?.length || 0} payloads`);
      
      if (!data.payloads || data.payloads.length === 0) {
          setErrorMessage("AI returned no payloads. Try a different technique or refine the request.");
      } else {
          setAttackPayloads(data.payloads);
      }
    } catch (err) {
      console.error("[FRONTEND] Generation Error:", err);
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const injectPayload = (req, param, payload) => {
    const regex = new RegExp(`(${param}=)([^&\\s]*)`, 'i');
    // Upgrade: use encodeURIComponent for robust injection
    return req.replace(regex, `$1${encodeURIComponent(payload)}`);
  };

  const insertPayload = (payload) => {
    if (!selectedVuln) {
      console.warn("selectedParam is undefined - ensure a target is selected");
      return;
    }
    setIsStaging(true);
    const updated = injectPayload(rawRequest, selectedVuln.parameter, payload);
    setRawRequest(updated);
    setAIRequest(updated);
    
    setTimeout(() => setIsStaging(false), 800);
    return updated;
  };

  const sendModifiedToRepeater = () => {
    addRawToRepeater(rawRequest);
    if (setMainTab) setMainTab('repeater');
  };

  const sendModifiedToIntruder = () => {
    // Stage the current modified request in Intruder
    setRawToIntruder(rawRequest);
    if (setMainTab) setMainTab('intruder');
  };

  const insertAndSend = (payload) => {
    const updated = insertPayload(payload);
    if (updated) {
      addRawToRepeater(updated);
      if (setMainTab) setMainTab('repeater');
    }
  };

  const previewPayload = (payload) => {
    if (!selectedVuln) return;
    const updated = injectPayload(rawRequest, selectedVuln.parameter, payload);
    setPayloadPreview(updated);
  };

  const runAllPayloads = async () => {
    if (!selectedVuln || attackPayloads.length === 0 || isAttacking) return;
    setIsAttacking(true);
    setAttackResults([]);
    
    // 1. Get Baseline if needed
    let currentBaseline = baseline;
    if (!currentBaseline) {
        try {
            const bRes = await fetch("http://127.0.0.1:8081/api/repeater/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raw: rawRequest, followRedirect: false })
            });
            const bData = await bRes.json();
            currentBaseline = { status: bData.status, length: bData.response?.length || 0 };
            setBaseline(currentBaseline);
        } catch (err) { console.error("Baseline Error:", err); }
    }

    const results = [];
    for (let p of attackPayloads) {
      const updatedReq = injectPayload(rawRequest, selectedVuln.parameter, p);
      try {
        const res = await fetch("http://127.0.0.1:8081/api/repeater/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw: updatedReq, followRedirect: false })
        });
        const data = await res.json();
        const currentLength = data.response?.length || 0;
        
        // 2. Anomaly Analysis
        let anomaly = null;
        if (currentBaseline) {
            if (data.status !== currentBaseline.status) anomaly = "STATUS_CHANGE";
            else if (Math.abs(currentLength - currentBaseline.length) > 20) anomaly = "LENGTH_CHANGE";
        }

        results.push({
          payload: p,
          status: data.status,
          length: currentLength,
          time: data.time,
          anomaly
        });
        setAttackResults([...results]); // Update UI incrementally
      } catch (err) {
        console.error(err);
      }
    }
    setIsAttacking(false);
  };

  const sendSetToIntruder = () => {
    const { setIntruderPayloads, addToIntruder } = require("../store");
    addToIntruder({ 
        method: "POST", // Placeholder, will use actual logic if needed
        url: "", 
        headers: {}, 
        body: "" 
    });
    // This is a bit complex due to store structure, let's just use the direct setters
  };

  const sendToStoreIntruder = () => {
      import("../store").then(store => {
          store.setIntruderPayloads(attackPayloads);
          setMainTab('intruder');
      });
  };

  const sendToRepeater = () => {
    addRawToRepeater(rawRequest);
    if (setMainTab) setMainTab('repeater');
  };

  return (
    <div className="pro-ai-container">
      <div className="pro-ai-toolbar">
         <button className={`pro-analyze-btn ${isLoading ? 'loading' : ''}`} onClick={runDeepAnalysis}>
           <Shield size={14} /> Start Interactive Scan
         </button>
         <div className="divider-v"></div>
         <div className="toolbar-info"><Shield size={14} /> <span>EagleEye Attack Intelligence Mode</span></div>
      </div>

      <div className="pro-ai-workspace" ref={workspaceRef}>
        {/* LEFT: LIVE ATTACK BUFFER */}
        <div className="pro-pane" style={{ width: `${dividerPos}%`, flex: 'none', borderRight: '1px solid var(--burp-border)' }}>
           <div className="pane-header-label" style={{ background: isStaging ? 'var(--burp-orange)' : '#f3f3f3', color: isStaging ? 'white' : '#666', transition: 'all 0.3s' }}>
             {isStaging ? 'ENGINE: UPDATING BUFFER...' : 'LIVE ATTACK BUFFER'}
           </div>
           <div className="editor-container" style={{ position: 'relative' }}>
             <textarea 
               className="pro-raw-editor" 
               value={rawRequest} 
               onChange={(e) => setRawRequest(e.target.value)} 
               spellCheck="false" 
               style={{ opacity: isStaging ? 0.6 : 1, transition: 'opacity 0.2s' }}
             />
             {isStaging && (
                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                   <div className="pro-radar" style={{ width: '20px', height: '20px' }}></div>
                </div>
             )}
           </div>
           <div className="pane-bottom-bar">
              <div className={`status-pill ${isStaging ? 'loading' : 'active'}`}>
                {isStaging ? 'AI SYNCING...' : 'BUFFER READY'}
              </div>
              <div style={{flex: 1}}></div>
              <button className="pro-mini-btn" onClick={sendToRepeater}><Shield size={12}/> Send to Repeater</button>
           </div>
        </div>

        <div className="workspace-divider" onMouseDown={(e) => { e.preventDefault(); /* resize logic omitted for brevity, keeping existing */ }} />

        {/* RIGHT: ATTACK ENGINE */}
        <div className="pro-pane" style={{ flex: 1 }}>
           <div className="pane-header-label" style={{ color: "#34495e" }}>ATTACK ENGINE</div>
           
           {isLoading ? (
             <div className="pro-empty-state">
               <div className="pro-loader-box">
                  <div className="pro-radar"></div>
                  <div className="pro-status-msg">{status}</div>
                  <div className="pro-progress-bar"><div className="bar-fill" style={{width: `${progress}%`}}></div></div>
               </div>
             </div>
           ) : !result ? (
             <div className="pro-empty-state">
               <div className="pro-placeholder">
                 <Shield size={48} className="icon-light" style={{ marginBottom: '20px', color: '#ff6633' }} />
                 <h4>Interactive Attack Engine</h4>
                 <p>Initialize a deep scan to discover mapped targets and unlock weaponized payload generators.</p>
               </div>
             </div>
           ) : (
             <div className="pro-results-content">
                <div className="editor-sub-tabs" style={{ background: "#e6e6e6" }}>
                  <button className={`editor-sub-tab ${activeResultTab === 'vulns' ? 'active' : ''}`} onClick={() => setActiveResultTab('vulns')}>Mapped Targets</button>
                  <button className={`editor-sub-tab ${activeResultTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveResultTab('overview')}>Intelligence</button>
                </div>

                <div className="pro-tab-body" style={{ display: 'flex', gap: '15px' }}>
                  {activeResultTab === "vulns" && (
                    <>
                      {/* VULN CARDS */}
                      <div className="vuln-grid" style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {result?.vulnerabilities?.map((v, i) => (
                          <div key={i} className={`vuln-card ${selectedVuln === v ? 'selected' : ''}`} onClick={() => { 
                            if (selectedVuln === v) return;
                            setIsPanelLoading(true);
                            setSelectedVuln(v); 
                            setAttackPayloads([]); 
                            setAttackVariant("default");
                            setTimeout(() => setIsPanelLoading(false), 600);
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                               <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span className="v-name">{v.name}</span>
                                  <span style={{ fontSize: '9px', color: '#95a5a6' }}>{v.location}</span>
                               </div>
                               <span className="v-rank" style={{ background: v.confidence > 0.8 ? '#e74c3c' : '#f39c12' }}>
                                 {v.confidence > 0.8 ? 'CRITICAL' : 'HIGH'}
                               </span>
                            </div>
                            <div style={{ marginTop: '10px' }}>
                               <span style={{ fontSize: '10px', color: '#7f8c8d' }}>Target: </span>
                               <code style={{ fontSize: '10px', color: '#e67e22', fontWeight: '700' }}>{v.parameter}</code>
                            </div>
                          </div>
                        )) || <div style={{fontSize: '11px', color: '#888', textAlign: 'center'}}>No targets mapped.</div>}
                      </div>

                      {/* ATTACK PANEL */}
                      <div className="attack-panel" style={{ flex: 1, border: '1px solid var(--burp-border)', borderRadius: '3px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                         {isPanelLoading ? (
                            <div className="empty-attack-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                               <div className="pro-radar" style={{ width: '80px', height: '80px' }}></div>
                               <div style={{ fontSize: '10px', color: 'var(--burp-orange)', marginTop: '15px', fontWeight: '700' }}>ANALYZING...</div>
                            </div>
                         ) : selectedVuln ? (
                           <>
                             <div className="panel-header">
                                <div>
                                   <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.8px' }}>{selectedVuln.name.toUpperCase()}</div>
                                   <div style={{ fontSize: '9px', opacity: 0.7, fontStyle: 'italic' }}>AI-WEAPONIZED VECTOR v4.2</div>
                                </div>
                                <div className="panel-status-bar">
                                   <div style={{ color: '#ffab91' }}>{Math.round(selectedVuln.confidence * 100)}% CONFIDENCE</div>
                                   <div style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '10px' }}>PARAM: {selectedVuln.parameter}</div>
                                </div>
                             </div>
                             
                             <div className="technique-selector">
                                <div style={{ fontSize: '9px', fontWeight: '800', color: '#999', textTransform: 'uppercase', marginBottom: '8px' }}>Select Exploitation Technique</div>
                                <div className="technique-chip-group">
                                   {(() => {
                                     const type = selectedVuln.name.toLowerCase();
                                     let variants = ["Payload Base"];
                                     if (type.includes("sql")) variants = ["Boolean Override", "UNION Select", "Time-Based", "Error-based"];
                                     else if (type.includes("xss")) variants = ["Reflected Context", "Stored Script", "DOM-Event", "SVG Polyglot"];
                                     else if (type.includes("idor")) variants = ["ID Increment", "UUID Bypass", "Vertical Jump"];
                                     else if (type.includes("injection")) variants = ["Command Chain", "Wget/Curl Bypass", "Reverse Shell"];
                                     
                                     return variants.map(v => (
                                       <div 
                                         key={v} 
                                         className={`technique-chip ${attackVariant === v ? 'active' : ''}`} 
                                         onClick={() => { setAttackVariant(v); setAttackPayloads([]); }}
                                       >
                                         {v}
                                       </div>
                                     ));
                                   })()}
                                </div>

                                {attackVariant !== "default" && attackVariant !== "Payload Base" && attackPayloads.length === 0 && (
                                   <button 
                                     className={`footer-btn-pro ${isGenerating ? 'loading' : ''}`} 
                                     disabled={isGenerating}
                                     style={{ width: '100%', background: 'var(--burp-orange)', color: 'white', marginTop: '15px' }}
                                     onClick={() => handleTechnique(attackVariant)}
                                   >
                                     {isGenerating ? "GENERATING VECTORS..." : `GENERATE ${attackVariant.toUpperCase()} PAYLOADS`}
                                   </button>
                                )}
                             </div>

                             <div className="payload-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                                   <div style={{ fontSize: '10px', fontWeight: '800', color: '#555' }}>WEAPONIZED PAYLOADS</div>
                                   {attackPayloads.length > 0 && (
                                     <button 
                                       className="action-btn-pill primary" 
                                       style={{ height: '20px' }} 
                                       onClick={runAllPayloads}
                                       disabled={isAttacking}
                                     >
                                       {isAttacking ? 'RUNNING ATTACK...' : 'RUN ALL PAYLOADS'}
                                     </button>
                                   )}
                                </div>

                                    {isGenerating ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px' }}>
                                         <div className="pro-radar" style={{ width: '40px', height: '40px' }}></div>
                                         <div style={{ fontSize: '9px', color: '#999', marginTop: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Analyzing Context & Weaponizing...</div>
                                      </div>
                                    ) : attackPayloads?.length > 0 ? (
                                       <div className="payload-rows">
                                          {attackPayloads.map((p, i) => (
                                            <div 
                                              key={i} 
                                              onMouseEnter={() => previewPayload(p)}
                                              onMouseLeave={() => setPayloadPreview("")}
                                              style={{ marginBottom: '8px' }}
                                            >
                                               <div className="pro-payload-row">
                                                  <div className="payload-content">{p}</div>
                                                  <div className="row-actions">
                                                     <div className="action-btn-pill" onClick={() => insertPayload(p)}>INSERT</div>
                                                  </div>
                                               </div>
                                               {payloadPreview === injectPayload(rawRequest, selectedVuln.parameter, p) && (
                                                 <div className="payload-preview-mini">
                                                    {payloadPreview.substring(0, 200)}...
                                                 </div>
                                               )}
                                            </div>
                                          ))}
                                       </div>
                                    ) : (
                                       <div style={{ textAlign: 'center', padding: '20px', color: '#95a5a6', fontSize: '10px', border: '1px dashed #ddd', borderRadius: '4px' }}>
                                          SELECT A TECHNIQUE ABOVE TO GENERATE VECTORS
                                       </div>
                                    )}

                                    {attackResults.length > 0 && (
                                      <div style={{ marginTop: '15px' }}>
                                         <div style={{ fontSize: '9px', fontWeight: '800', color: '#555', marginBottom: '8px', borderBottom: '1px solid #eee' }}>AUTOMATED SCAN TELEMETRY</div>
                                         <table className="attack-results-table">
                                            <thead>
                                               <tr>
                                                  <th>VECTOR</th>
                                                  <th>HTTP</th>
                                                  <th>SIZE</th>
                                                  <th>FLAG</th>
                                               </tr>
                                            </thead>
                                            <tbody>
                                               {attackResults.map((r, i) => (
                                                 <tr key={i} style={{ background: r.anomaly ? 'rgba(231, 76, 60, 0.04)' : 'transparent' }}>
                                                    <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><code>{r.payload}</code></td>
                                                    <td><span style={{ color: r.status >= 400 ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>{r.status}</span></td>
                                                    <td style={{ color: '#666' }}>{r.length}</td>
                                                    <td>
                                                        {r.anomaly ? (
                                                            <span className="anomaly-hit">
                                                                🔥 SUCCESS: {r.anomaly}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#bdc3c7' }}>CLEAN</span>
                                                        )}
                                                    </td>
                                                 </tr>
                                               ))}
                                            </tbody>
                                         </table>
                                      </div>
                                    )}
                                 </div>

                              <div className="attack-footer">
                                 <button className="footer-btn-pro" style={{ background: 'var(--burp-orange)', color: 'white' }} onClick={sendToRepeater}>
                                    <Shield size={12} style={{marginRight: '8px'}}/> REPEATER
                                 </button>
                                 <button className="footer-btn-pro" style={{ background: '#34495e', color: 'white' }} onClick={sendModifiedToIntruder}>
                                    <Shield size={12} style={{marginRight: '8px'}}/> INTRUDER
                                 </button>
                              </div>
                           </>
                         ) : (
                            <div className="empty-attack-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999', textAlign: 'center', padding: '40px' }}>
                               <Shield size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
                               <div style={{ fontSize: '12px' }}>Select a mapped vulnerability to initialize the attack panel.</div>
                            </div>
                         )}
                      </div>
                    </>
                  )}

                  {activeResultTab === "overview" && (
                    <div className="pro-view-pane">
                       <div className="pro-risk-summary">
                          <div className={`risk-tag ${result?.summary?.risk.toLowerCase()}`}>{result?.summary?.risk} RISK</div>
                          <div className="risk-desc">Target: {result?.summary?.type}</div>
                       </div>
                       <div className="pro-priority-box">
                         <div className="box-header">STRATEGIC VULNERABILITIES</div>
                         <div className="box-body">
                            {result.priority?.map((p, i) => <div key={i} className="priority-item"><Shield size={12}/> {p}</div>)}
                         </div>
                       </div>
                    </div>
                  )}
                </div>
             </div>
           )}
           <div className="pane-bottom-bar">
              <Shield size={14} color="#999" />
              <input type="text" placeholder="Search..." style={{ border: "none", outline: "none", background: "transparent", fontSize: "11px", color: "#666", flex: 1 }} />
              <span style={{ color: "#aaa" }}>Active Attack Engine</span>
           </div>
        </div>
      </div>
    </div>
  );
}
