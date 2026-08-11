import React, { useState, useEffect } from 'react';
import { AIProvider } from '../types';

export const SettingsView: React.FC = () => {
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('querypilot_saved_keys');
      return saved ? JSON.parse(saved) : {
        Groq: '',
        Gemini: '',
        OpenAI: '',
        Claude: '',
        OpenRouter: ''
      };
    } catch {
      return {
        Groq: '',
        Gemini: '',
        OpenAI: '',
        Claude: '',
        OpenRouter: ''
      };
    }
  });

  const [localUrl, setLocalUrl] = useState('http://localhost:1234/v1');
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [cacheSize, setCacheSize] = useState(0);

  const [rowLimit, setRowLimit] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('querypilot_row_limit');
      return saved !== null ? parseInt(saved, 10) : 30;
    } catch {
      return 30;
    }
  });

  const [providerStatuses, setProviderStatuses] = useState<Record<string, boolean>>({});
  const [savedProvider, setSavedProvider] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const fetchHealth = () => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.providers) setProviderStatuses(data.providers);
        if (data.apiKeys) {
          setKeys(prev => {
            const updated = { ...prev };
            Object.keys(data.apiKeys).forEach(k => {
              if (data.apiKeys[k]) updated[k] = data.apiKeys[k];
            });
            localStorage.setItem('querypilot_saved_keys', JSON.stringify(updated));
            return updated;
          });
        }
        if (data.localEndpointUrl) setLocalUrl(data.localEndpointUrl);
        if (typeof data.cacheEnabled === 'boolean') setCacheEnabled(data.cacheEnabled);
        if (typeof data.cacheSize === 'number') setCacheSize(data.cacheSize);
      })
      .catch(err => console.error("Health check failed:", err));
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    localStorage.setItem('querypilot_saved_keys', JSON.stringify(keys));
  }, [keys]);

  const handleSaveProviderKey = async (provider: AIProvider) => {
    setIsSaving(true);
    try {
      const apiKey = keys[provider];
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey ? apiKey.trim() : undefined,
          localUrl: provider === 'Local' ? localUrl.trim() : undefined,
          cacheEnabled
        })
      });
      const data = await res.json();
      if (data.success) {
        setProviderStatuses(prev => ({ ...prev, [provider]: true }));
        setSavedProvider(provider);
        setTimeout(() => setSavedProvider(null), 3000);
      }
    } catch (err) {
      console.error("Failed to save provider key:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCache = async (enabled: boolean) => {
    setCacheEnabled(enabled);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cacheEnabled: enabled })
      });
      setCacheNotice(`Redis query cache ${enabled ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setCacheNotice(null), 3000);
    } catch (err) {
      console.error("Failed to toggle cache:", err);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await fetch('/api/cache/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCacheSize(0);
        setCacheNotice("Redis query cache cleared successfully.");
        setTimeout(() => setCacheNotice(null), 3000);
      }
    } catch (err) {
      console.error("Failed to clear cache:", err);
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleSaveRowLimit = (newLimit: number) => {
    setRowLimit(newLimit);
    localStorage.setItem('querypilot_row_limit', newLimit.toString());
    setCacheNotice(`Default result row limit set to ${newLimit === 0 ? 'Unlimited' : `${newLimit} rows`}.`);
    setTimeout(() => setCacheNotice(null), 3000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-h-screen flex flex-col gap-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-[#e2e2e6] mb-1">AI Provider & System Settings</h1>
        <p className="text-sm md:text-base text-[#c9c4d8]">Configure AI API keys, Redis query cache, and default result row display limits.</p>
      </header>

      {savedProvider && (
        <div className="bg-[#4ae176]/10 border border-[#4ae176]/30 text-[#4ae176] p-3 rounded-lg text-xs md:text-sm flex items-center gap-2 font-semibold">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          Configuration for {savedProvider} saved permanently to api_keys.json!
        </div>
      )}

      {cacheNotice && (
        <div className="bg-[#947dff]/10 border border-[#947dff]/30 text-[#cabeff] p-3 rounded-lg text-xs md:text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">bolt</span>
          {cacheNotice}
        </div>
      )}

      {/* Default Result Row Limit Settings Card */}
      <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-6 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#cabeff]">table_rows</span>
            <h2 className="text-base font-bold text-[#e2e2e6]">Default Query Result Row Limit</h2>
          </div>
          <select
            value={rowLimit}
            onChange={(e) => handleSaveRowLimit(parseInt(e.target.value, 10))}
            className="bg-[#111317] text-[#e2e2e6] border border-[#333538] px-3 py-1.5 rounded-lg text-xs font-mono font-bold outline-none focus:border-[#947dff] cursor-pointer"
          >
            <option value={10}>10 rows</option>
            <option value={30}>30 rows (Default)</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
            <option value={500}>500 rows</option>
            <option value={0}>Unlimited</option>
          </select>
        </div>
        <p className="text-xs text-[#c9c4d8] leading-relaxed">
          Set the default maximum number of data rows displayed in live execution tables (default: 30 rows + header row with row numbers starting at 1).
        </p>
      </div>

      {/* Redis / In-Memory Query Cache Management Card */}
      <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-6 space-y-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333538] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4ae176]">bolt</span>
            <h2 className="text-lg font-bold text-[#e2e2e6]">Redis Query Cache</h2>
            <span className="text-xs font-mono bg-[#111317] text-[#4ae176] px-2 py-0.5 rounded border border-[#333538]">
              {cacheSize} / 20 Cached Queries
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggleCache(!cacheEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                cacheEnabled 
                  ? 'bg-[#4ae176]/20 text-[#4ae176] border border-[#4ae176]/40' 
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}
            >
              Cache: {cacheEnabled ? 'ENABLED' : 'DISABLED'}
            </button>

            <button
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              {isClearingCache ? 'Clearing...' : 'Clear Cache'}
            </button>
          </div>
        </div>

        <p className="text-xs text-[#c9c4d8] leading-relaxed">
          The query cache stores up to 20 case-insensitive natural language queries and their SQL results to save AI API tokens and speed up repeat executions.
        </p>
      </div>

      {/* Multi-AI Provider API Key Cards (Saved permanently in api_keys.json) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Groq API */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#cabeff]">bolt</span> Groq AI API
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
              providerStatuses.Groq ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {providerStatuses.Groq ? 'Connected & Saved' : 'Key Needed'}
            </span>
          </div>
          <input
            type="password"
            placeholder="gsk_..."
            value={keys.Groq}
            onChange={(e) => setKeys({ ...keys, Groq: e.target.value })}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-[11px] text-[#cabeff] underline">Get Groq Key</a>
            <button
              onClick={() => handleSaveProviderKey('Groq')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* Google Gemini API */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ae176]">auto_awesome</span> Google Gemini API
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
              providerStatuses.Gemini ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {providerStatuses.Gemini ? 'Connected & Saved' : 'Key Needed'}
            </span>
          </div>
          <input
            type="password"
            placeholder="AIzaSy..."
            value={keys.Gemini}
            onChange={(e) => setKeys({ ...keys, Gemini: e.target.value })}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-[11px] text-[#cabeff] underline">Get Gemini Key</a>
            <button
              onClick={() => handleSaveProviderKey('Gemini')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* OpenAI API */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#cabeff]">smart_toy</span> OpenAI API
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
              providerStatuses.OpenAI ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {providerStatuses.OpenAI ? 'Connected & Saved' : 'Key Needed'}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-..."
            value={keys.OpenAI}
            onChange={(e) => setKeys({ ...keys, OpenAI: e.target.value })}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="text-[11px] text-[#cabeff] underline">Get OpenAI Key</a>
            <button
              onClick={() => handleSaveProviderKey('OpenAI')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* Anthropic Claude API */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#cabeff]">psychology</span> Anthropic Claude API
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
              providerStatuses.Claude ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {providerStatuses.Claude ? 'Connected & Saved' : 'Key Needed'}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={keys.Claude}
            onChange={(e) => setKeys({ ...keys, Claude: e.target.value })}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-[11px] text-[#cabeff] underline">Get Claude Key</a>
            <button
              onClick={() => handleSaveProviderKey('Claude')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* OpenRouter API */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ae176]">alt_route</span> OpenRouter API
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
              providerStatuses.OpenRouter ? 'bg-[#4ae176]/20 text-[#4ae176]' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {providerStatuses.OpenRouter ? 'Connected & Saved' : 'Key Needed'}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-or-v1-..."
            value={keys.OpenRouter}
            onChange={(e) => setKeys({ ...keys, OpenRouter: e.target.value })}
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="text-[11px] text-[#cabeff] underline">Get OpenRouter Key</a>
            <button
              onClick={() => handleSaveProviderKey('OpenRouter')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>

        {/* Local AI Endpoint */}
        <div className="bg-[#1e2023] border border-[#333538] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#e2e2e6] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ae176]">computer</span> Local AI Endpoint
            </h3>
            <span className="text-[10px] bg-[#4ae176]/20 text-[#4ae176] px-2 py-0.5 rounded font-mono font-semibold">Active & Saved</span>
          </div>
          <input
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="http://localhost:1234/v1"
            className="w-full bg-[#111317] border border-[#333538] text-[#e2e2e6] rounded-lg p-2 text-xs outline-none focus:border-[#947dff] font-mono"
          />
          <div className="flex justify-between items-center pt-1">
            <span className="text-[11px] text-[#938ea1]">LM Studio / Ollama / LocalAI</span>
            <button
              onClick={() => handleSaveProviderKey('Local')}
              disabled={isSaving}
              className="bg-[#947dff] text-[#2b0088] font-semibold px-3 py-1 rounded text-xs hover:bg-[#cabeff] cursor-pointer"
            >
              Save Endpoint
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
