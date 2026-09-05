import React, { useState } from "react";
import { Play, ChevronLeft } from "lucide-react";

export default function Setup({ onNext, onBack }) {
  const [useDefault, setUseDefault] = useState(true);

  return (
    <div className="wizard-container">
      <div className="wizard-card">
        <h2 className="wizard-title">Select configuration</h2>
        <p className="wizard-subtitle">
          Select a configuration for the new project. You can use standard settings or load a configuration file.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "30px" }}>
           <div 
             style={{ 
               border: useDefault ? "1px solid var(--burp-orange)" : "1px solid #ddd", 
               padding: "12px", 
               borderRadius: "5px", 
               background: useDefault ? "#fff9f6" : "#fff",
               cursor: "pointer" 
             }}
             onClick={() => setUseDefault(true)}
           >
              <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>Use EagleEye defaults</div>
              <div style={{ fontSize: "11px", color: "#666" }}>Optimized settings for intercepting and auditing web traffic.</div>
           </div>
           
           <div 
             style={{ 
                border: !useDefault ? "1px solid var(--burp-orange)" : "1px solid #ddd", 
                padding: "12px", 
                borderRadius: "5px", 
                background: !useDefault ? "#fff9f6" : "#fff",
                cursor: "pointer" 
             }}
             onClick={() => setUseDefault(false)}
           >
              <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>Use a specific configuration file</div>
              <div style={{ fontSize: "11px", color: "#666" }}>Load a previously saved JSON configuration.</div>
           </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
           <button 
             onClick={onBack}
             style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}
           >
             <ChevronLeft size={16} /> Back
           </button>
           <button className="wizard-primary-btn" onClick={onNext}>
             Start EagleEye <Play size={16} />
           </button>
        </div>
        
        <div className="wizard-footer">
          Build v2026.4.17 - Standard Edition
        </div>
      </div>
    </div>
  );
}
