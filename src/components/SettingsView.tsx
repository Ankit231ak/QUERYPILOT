import React, { useState, useEffect } from 'react';

export const SettingsView: React.FC = () => {
  const [defaultModel, setDefaultModel] = useState('Llama 3.3 70B Versatile');
  const [groqKey, setGroqKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHasKey(Boolean(data.hasGroqKey));
      })
      .catch(err => console.error("Health check failed:", err));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (groqKey.trim()) {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: groqKey.trim() })
        });
        const data = await res.json();
        if (data.success) {
          setHasKey(true);
          setGroqKey('');
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-screen flex flex-col gap-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-[#e2e2e6] mb-1">Settings</h1>
        <p className="text-sm md:text-base text-[#c9c4d8]">Configure Groq AI Engine preferences and API key options.</p>
      </header>

      {saved && (
        <div className="bg-[#4ae176]/10 border border-[#4ae176]/30 text-[#4ae176] p-3 rounded-lg text-xs md:text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          Settings updated successfully!
        </div>
      )}

      {/* Groq API Key Configuration */}
      <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#e2e2e6] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#cabeff]">key</span>
          Groq AI API Integration
        </h2>

        <div>
          <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Groq API Key</label>
          <div className="flex gap-2">
            <input 
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder={hasKey ? "•••••••••••••••••••••••• (API Key Active)" : "gsk_..."}
              className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff] font-mono"
            />
          </div>
          <p className="text-xs text-[#c9c4d8] mt-1.5">
            Get your free Groq API key from <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[#cabeff] underline">console.groq.com</a>.
          </p>
        </div>

        <div className="p-3 bg-[#111317] rounded-lg border border-[#333538] text-xs text-[#c9c4d8] flex items-center justify-between">
          <span>Groq API Connection Status:</span>
          {hasKey ? (
            <span className="text-[#4ae176] font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#4ae176]"></span> Active
            </span>
          ) : (
            <span className="text-amber-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span> Key Needed for AI Generation
            </span>
          )}
        </div>
      </div>

      {/* AI Model Preferences */}
      <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#e2e2e6] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#cabeff]">psychology</span>
          Groq AI Model Preferences
        </h2>

        <div>
          <label className="block text-xs font-semibold text-[#c9c4d8] mb-1">Default Groq Model for SQL Generation</label>
          <select 
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2.5 text-xs outline-none focus:border-[#947dff]"
          >
            <option value="Llama 3.3 70B Versatile">Llama 3.3 70B Versatile (Recommended)</option>
            <option value="Llama 3.1 8B Instant">Llama 3.1 8B Instant (Ultra-fast)</option>
            <option value="DeepSeek R1 Distill 70B">DeepSeek R1 Distill Llama 70B (Complex Joins)</option>
            <option value="Mixtral 8x7B">Mixtral 8x7B</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#cabeff] hover:bg-[#947dff] text-[#32009a] font-semibold px-6 py-2.5 rounded-lg text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
