import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Search, Globe, Shield, Zap, Info, Settings } from "lucide-react";

export default function Intercept({ interceptOn, onToggle, onRightClick }) {
  const [reqQueue, setReqQueue] = useState([]);
  const [resQueue, setResQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rawEdit, setRawEdit] = useState("");
  const [openSections, setOpenSections] = useState({ attrs: true, headers: true, params: false });

  const toggleSection = (s) => setOpenSections(prev => ({ ...prev, [s]: !prev[s] }));

  const fetchData = () => {
    fetch("http://127.0.0.1:8081/api/intercept/queue")
      .then(res => res.json())
      .then(data => setReqQueue(data.map(item => ({ ...item, type: "request" }))))
      .catch(err => console.error("Error fetching req queue:", err));

    fetch("http://127.0.0.1:8081/api/intercept-response/queue")
      .then(res => res.json())
      .then(data => setResQueue(data.map(item => ({ ...item, type: "response" }))))
      .catch(err => console.error("Error fetching res queue:", err));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  const unifiedQueue = [...reqQueue, ...resQueue];
  const currentItem = unifiedQueue[currentIndex];

  useEffect(() => {
    if (currentItem) {
      if (currentItem.type === "request") {
        let path = "/";
        try {
          const urlObj = new URL(currentItem.url);
          path = urlObj.pathname + urlObj.search;
        } catch(e) { path = currentItem.url; }

        const headerText = `${currentItem.method} ${path} HTTP/1.1\n` + 
                           Object.entries(currentItem.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
        const bodyText = currentItem.body ? (typeof currentItem.body === 'string' ? currentItem.body : JSON.stringify(currentItem.body, null, 2)) : "";
        setRawEdit(headerText + "\n\n" + bodyText);
      } else {
        const headerText = `HTTP/1.1 ${currentItem.statusCode}\n` + 
                           Object.entries(currentItem.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
        setRawEdit(headerText + "\n\n" + (currentItem.body || ""));
      }
    } else {
      setRawEdit("");
    }
  }, [currentItem?.id, currentItem?.type]);

  const handleForward = () => {
    if (!currentItem) return;
    const url = currentItem.type === "request" 
      ? "http://127.0.0.1:8081/api/intercept/forward" 
      : "http://127.0.0.1:8081/api/intercept-response/forward";
      
    const body = currentItem.type === "request"
      ? { id: currentItem.id, modifiedRaw: rawEdit }
      : { id: currentItem.id, modifiedBody: rawEdit.split("\n\n")[1] || rawEdit };

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(() => {
      fetchData();
      if (currentIndex > 0) setCurrentIndex(i => i - 1);
    });
  };

  const handleDrop = () => {
    if (!currentItem || currentItem.type === "response") return;
    fetch("http://127.0.0.1:8081/api/intercept/drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentItem.id })
    }).then(() => {
      fetchData();
      if (currentIndex > 0) setCurrentIndex(i => i - 1);
    });
  };

  return (
    <div className="intercept-view">
      <div className="intercept-toolbar">
        <button className="toolbar-btn primary" onClick={handleForward} disabled={!currentItem}>Forward</button>
        <button className="toolbar-btn danger" onClick={handleDrop} disabled={!currentItem || currentItem.type === "response"}>Drop</button>
        <button className={`intercept-toggle-btn ${interceptOn ? 'active' : ''}`} onClick={onToggle}>Intercept is {interceptOn ? "on" : "off"}</button>
        <button className="toolbar-btn" disabled>Action</button>
        <button className="toolbar-btn">Open browser</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px", fontSize: "11px" }}>
            <button className="toolbar-btn" style={{ padding: "4px 8px" }} disabled={currentIndex === 0} onClick={() => setCurrentIndex(i => i - 1)}>{"<"}</button>
            <span style={{ minWidth: "50px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{unifiedQueue.length > 0 ? `${currentIndex + 1} of ${unifiedQueue.length}` : "0 of 0"}</span>
            <button className="toolbar-btn" style={{ padding: "4px 8px" }} disabled={currentIndex >= unifiedQueue.length - 1} onClick={() => setCurrentIndex(i => i + 1)}>{">"}</button>
        </div>
      </div>

      {currentItem ? (
        <div className="request-inspector editable">
          <div className="intercept-info-bar">
             <div style={{ color: "var(--burp-orange)", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
               <Shield size={14} /> {currentItem.type === 'request' ? 'Request' : 'Response'} to
             </div>
             <div style={{ fontWeight: "600", color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
               {currentItem.url || "Target Server"}
             </div>
          </div>
          <div className="editor-sub-tabs">
             <button className="editor-sub-tab">Pretty</button>
             <button className="editor-sub-tab active">Raw</button>
             <button className="editor-sub-tab">Hex</button>
          </div>
          <div className="intercept-workspace-main">
            <div className="raw-editor-container" style={{ flex: 1, display: "flex", borderRight: "1px solid var(--burp-border)", background: "#f8f9fa" }}>
              <textarea 
                className="raw-editor"
                value={rawEdit}
                onChange={(e) => setRawEdit(e.target.value)}
                spellCheck="false"
                style={{ background: "transparent" }}
                onContextMenu={(e) => onRightClick ? onRightClick(e, currentItem) : null}
              />
            </div>
            
            <div className="intercept-inspector">
               <div className="inspector-header">
                 <span>Inspector</span>
                 <Settings size={14} style={{ opacity: 0.6 }} />
               </div>
               
               <div className="inspector-section-wrapper">
                 <div className="inspector-section-header" onClick={() => toggleSection('attrs')}>
                   {openSections.attrs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                   <span>Request Attributes</span>
                 </div>
                 {openSections.attrs && (
                   <div className="inspector-section-content">
                     <div className="attr-row">
                       <span className="attr-name">Method</span>
                       <span className="attr-val">{currentItem.method}</span>
                     </div>
                     <div className="attr-row">
                       <span className="attr-name">Protocol</span>
                       <span className="attr-val">HTTP/1.1</span>
                     </div>
                   </div>
                 )}

                 <div className="inspector-section-header" onClick={() => toggleSection('headers')}>
                   {openSections.headers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                   <span>Request Headers ({Object.keys(currentItem.headers || {}).length})</span>
                 </div>
                 {openSections.headers && (
                   <div className="inspector-section-content">
                     {Object.entries(currentItem.headers || {}).map(([k, v]) => (
                       <div key={k} className="attr-row">
                         <span className="attr-name" title={k}>{k}</span>
                         <span className="attr-val" title={v}>{v}</span>
                       </div>
                     ))}
                   </div>
                 )}

                 <div className="inspector-section-header" onClick={() => toggleSection('params')}>
                   {openSections.params ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                   <span>Query Parameters</span>
                 </div>
                 {openSections.params && (
                   <div className="inspector-section-content">
                      <div style={{ padding: "8px", color: "#888", fontStyle: "italic", fontSize: "11px" }}>No parameters found.</div>
                   </div>
                 )}
               </div>
            </div>
          </div>
          
          <div className="pane-bottom-bar" style={{ borderTop: "1px solid var(--burp-border)" }}>
             <Search size={14} color="#999" />
             <input type="text" placeholder="Search..." style={{ border: "none", outline: "none", background: "transparent", fontSize: "11px", color: "#666", flex: 1 }} />
             <span style={{ color: "#aaa", fontSize: "11px" }}>0 matches</span>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="traffic-light-sim">
             <div className={`light red ${!interceptOn ? 'active' : ''}`}></div>
             <div className={`light green ${interceptOn ? 'active' : ''}`}></div>
          </div>
          <h2 style={{ margin: "10px 0", color: "#333", fontSize: "20px" }}>Intercept is {interceptOn ? "on" : "off"}</h2>
          <p style={{ color: "#666", maxWidth: "450px", lineHeight: "1.6", fontSize: "13px" }}>
            Traffic is currently {interceptOn ? 'being held for review' : 'flowing normally through the proxy'}. 
            {interceptOn ? ' Configure your browser to use the proxy listener to see requests here.' : ' Enable interception to pause and modify traffic.'}
          </p>
          <div style={{ marginTop: "25px", display: "flex", gap: "10px" }}>
             <button className="toolbar-btn">Interception rules</button>
             <button className="toolbar-btn primary" style={{ background: "var(--burp-orange)", color: "white", borderColor: "#d35400" }}>Open browser</button>
          </div>
        </div>
      )}
    </div>
  );
}
