import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Trash2, 
  PlusCircle, 
  Network, 
  Terminal,
  Info,
  ChevronRight,
  Zap,
  Layout,
  Database,
  RefreshCw,
  Volume2,
  Mic,
  MicOff
} from 'lucide-react';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { motion, AnimatePresence } from 'motion/react';

interface Triplet {
  subject: string;
  verb: string;
  object: string;
}

interface InferenceResult {
  path: Triplet[];
  explanation: string;
  certainty: number;
}

// import { chatWithAI } from './services/aiService';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [inferenceStart, setInferenceStart] = useState('');
  const [inferenceEnd, setInferenceEnd] = useState('');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [messages, setMessages] = useState<{
    role: 'user' | 'assistant';
    content: string;
    type?: 'hybrid';
    logic?: InferenceResult;
  }[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<{msg: string, time: string}[]>([]);
  const [consistency, setConsistency] = useState('Nominal');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'chat' | 'graph' | 'input'>('chat');

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSearching]);

  const addLog = (msg: string) => {
    setLogs(prev => [{ msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const handleLearn = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`Learned ${data.triplets.length} facts.`);
        setInputText('');
      }
    } catch (e) {
      addLog('Error during learning phase.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async () => {
    if (!inferenceStart || !inferenceEnd) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: inferenceStart, end: inferenceEnd })
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        addLog(`Path found between ${inferenceStart} and ${inferenceEnd}`);
      } else {
        addLog('No logical connection detected.');
      }
    } catch (e) {
      addLog('Inference error.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all knowledge?')) return;
    await fetch('/api/clear', { method: 'POST' });
    setResult(null);
    addLog('Memory cleared.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    addLog(`Uploading: ${file.name}...`);
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        addLog(`Processed ${file.name}: ${data.tripletsCount} triplets extracted.`);
        fetchNodes();
    } catch (e) {
        addLog(`Error uploading ${file.name}`);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    
    setIsSearching(true);
    setTimeout(() => setSearchQuery(''), 0);
    
    // Add User Message immediately
    setMessages(prev => [...prev, { role: 'user', content: query }]);

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: query, userId: 'user_1' })
        });
        const data = await resp.json();
        
        if (resp.ok) {
            const finalizedResponse = data.response;

            setConsistency(data.consistency || 'Nominal');
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: finalizedResponse,
                type: 'hybrid',
                logic: data.logic || (data.context && data.context.length > 0 ? { 
                    path: data.context.map((c: string) => {
                        const parts = c.split(', ');
                        return { subject: parts[0] || 'Unknown', verb: parts[1] || 'relates', object: parts[2] || '...' };
                    }),
                    explanation: 'Related facts retrieved from Knowledge Base.',
                    certainty: 0.8
                } : undefined)
            }]);
            
            // Add system messages if any
            if (data.systemMessages) {
                data.systemMessages.forEach((msg: string) => {
                    setMessages(prev => [...prev, { role: 'assistant', content: msg, type: 'system' as any }]);
                });
            }
            
            // Process granular symbolic logs
            if (data.logs && Array.isArray(data.logs)) {
                data.logs.forEach((log: string) => addLog(log));
            } else {
                addLog(`Query processed securely.`);
            }
            
            fetchNodes(); // Consistency: Refresh graph if something was learned
        } else {
            throw new Error('Chat API failed');
        }
    } catch (err) {
        addLog('Intelligence subsystem latency detected.');
        setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: 'Sorry, I encountered an issue processing that query.' 
        }]);
    } finally {
        setIsSearching(false);
    }
  };

  const speakResponse = (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    addLog('System is reading symbolic output...');
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'my-MM'; // Burmese
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.error('Speech Error:', err);
        setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
        setIsListening(false);
        window.speechSynthesis.cancel();
        return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
        addLog('Voice recognition not supported in this browser.');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'my-MM';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        setIsListening(true);
        addLog('System is listening...');
    };

    recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setIsListening(false);
    };

    recognition.onerror = () => {
        setIsListening(false);
        addLog('Could not detect speech.');
    };

    recognition.onend = () => {
        setIsListening(false);
    };

    recognition.start();
  };

  const [nodeList, setNodeList] = useState<any[]>([]);

  const fetchNodes = async (sync = false) => {
    try {
        if (sync) {
            await fetch('/api/sync', { method: 'POST' });
        }
        const res = await fetch('/api/tree');
        if (res.ok) {
            const data = await res.json();
            setNodeList(data);
        }
    } catch (e) {}
  };

  useEffect(() => {
    fetchNodes();
    const timer = setInterval(fetchNodes, 5000);
    return () => clearInterval(timer);
  }, []);

  const formatVerb = (v: string) => {
    if (v === 'is_state') return 'is';
    if (v === 'is_a') return 'is a';
    return v.replace(/_/g, ' ');
  };

  return (
    <div className="min-h-screen bg-sky-50 text-[#1A1A1E] font-sans selection:bg-blue-100">
      {/* Dynamic Background Element */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-10 border-b border-black/[0.05] bg-white/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1E] rounded-xl flex items-center justify-center text-white shadow-lg shadow-black/10">
              <Brain size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none mb-1">LogicEngine <span className="text-blue-600">v3</span></h1>
              <p className="text-[10px] uppercase font-bold tracking-[0.1em] opacity-30">Universal Symbolic Intelligence</p>
            </div>
          </div>
          
            <div className="flex items-center gap-4">
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full ${consistency === 'Nominal' ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-orange-500/10 border-orange-500/20 text-orange-600'} text-[10px] font-bold uppercase tracking-widest`}>
                <div className={`w-1.5 h-1.5 rounded-full ${consistency === 'Nominal' ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`}></div>
                Consistency: {consistency}
            </div>
            <button 
                onClick={handleClear}
                className="group flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 rounded-full transition-all"
            >
                <Trash2 size={14} className="group-hover:rotate-12 transition-transform" />
                Clear System
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-6 font-sans">
        
        {/* Mode Switcher */}
        <div className="flex items-center justify-center mb-12">
            <div className="bg-white/50 backdrop-blur-md p-1.5 rounded-full border border-black/[0.05] flex gap-1 shadow-sm">
                {[
                    { id: 'chat', label: 'Logical Chat', icon: Terminal },
                    { id: 'graph', label: 'Topology', icon: Network },
                    { id: 'input', label: 'Knowledge Base', icon: Brain }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`
                            px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2
                            ${activeTab === tab.id 
                                ? 'bg-[#1A1A1E] text-white shadow-lg shadow-black/10' 
                                : 'text-black/40 hover:text-black/70 hover:bg-black/5'}
                        `}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>

        <AnimatePresence mode="wait">
            {activeTab === 'chat' && (
                <motion.div 
                    key="chat"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex flex-col h-[80vh]"
                >
                    <div 
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto px-4 py-4 space-y-8 mb-6 scroller flex flex-col"
                    >
                        {messages.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-20 italic">
                                <Terminal size={48} className="mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest">Logic Hub Initialized</p>
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[90%] md:max-w-[75%] rounded-3xl p-5 shadow-sm border ${
                                    msg.role === 'user' 
                                    ? 'bg-[#1A1A1E] text-white' 
                                    : (msg.type as any === 'system' 
                                        ? 'bg-orange-50 border-orange-200 text-orange-800' 
                                        : 'bg-white text-[#1A1A1E] border-black/5')
                                }`}>
                                    {msg.type as any === 'system' && (
                                        <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
                                            <Info size={12} />
                                            System Alert
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start gap-4">
                                        <p className={`${msg.type as any === 'system' ? 'text-xs italic' : 'text-base md:text-lg'} leading-relaxed flex-1`}>{msg.content}</p>
                                        {msg.role === 'assistant' && msg.type !== 'system' && (
                                            <button 
                                                onClick={() => speakResponse(msg.content)}
                                                className={`p-2 rounded-full transition-all ${isSpeaking ? 'text-blue-500 animate-pulse' : 'text-black/20 hover:text-blue-500 hover:bg-blue-50'}`}
                                                title="Read aloud"
                                            >
                                                <Volume2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                    
                                    {msg.logic && (
                                        <div className={`mt-4 pt-4 border-t ${msg.role === 'user' ? 'border-white/10' : 'border-black/5'} space-y-3`}>
                                            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest opacity-40">
                                                <div className="flex items-center gap-1">
                                                    <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                                    <span>Reasoning Trace</span>
                                                </div>
                                                {msg.logic.certainty && (
                                                    <span className="text-blue-500">{Math.round(msg.logic.certainty * 100)}% Confidence</span>
                                                )}
                                            </div>
                                            
                                            {msg.logic.path && msg.logic.path.length > 0 && (
                                                <div className="flex flex-col gap-2 pt-1">
                                                    {msg.logic.path.map((p: any, i: number) => (
                                                        <div key={i} className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                <span className="w-4 h-4 rounded-full bg-blue-500/10 flex items-center justify-center text-[8px] font-bold text-blue-600 border border-blue-500/20">{i+1}</span>
                                                                <span className="font-semibold">{p.subject}</span>
                                                                <span className="text-blue-500 font-bold opacity-40 italic">{p.verb?.replace(/_/g, ' ') || 'is'}</span>
                                                                <span className="font-semibold">{p.object}</span>
                                                            </div>
                                                            {msg.logic.logs && msg.logic.logs[i] && (
                                                                <p className={`text-[10px] ml-6 leading-relaxed ${msg.role === 'user' ? 'text-white/60' : 'text-black/50'}`}>
                                                                    {msg.logic.logs[i]}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {msg.logic.explanation && msg.logic.explanation !== msg.content && (
                                                <p className="text-sm italic opacity-70 border-l-2 border-blue-500/50 pl-3 py-0.5">{msg.logic.explanation}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isSearching && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-black/5 rounded-3xl px-6 py-4 flex gap-2">
                                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-2 h-2 bg-blue-600 rounded-full" />
                                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-2 h-2 bg-blue-600 rounded-full" />
                                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-2 h-2 bg-blue-600 rounded-full" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mx-auto w-full max-w-4xl pb-6 pt-2">
                        <form onSubmit={handleSearch} className="relative group px-4">
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.txt,.html,.docx" />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-black/5 rounded-full text-blue-600 transition-colors">
                                    <Database size={18} />
                                </button>
                                <button 
                                    type="button" 
                                    onClick={toggleListening}
                                    className={`p-2 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-black/5 text-blue-600'}`}
                                >
                                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                                </button>
                                <Terminal className="w-5 h-5 text-blue-600 opacity-60" />
                            </div>
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="မေးခွန်းတစ်ခုခု မေးပါ..."
                                className="w-full bg-white border border-black/[0.08] rounded-full py-5 pl-20 pr-28 text-lg focus:outline-none focus:ring-4 focus:ring-blue-500/5 shadow-lg shadow-black/5 transition-all"
                            />
                            <button 
                                type="submit"
                                disabled={isSearching}
                                className="absolute right-7 top-1/2 -translate-y-1/2 bg-[#1A1A1E] text-white px-6 py-3 rounded-full text-[12px] font-bold tracking-widest uppercase hover:bg-black transition-all disabled:opacity-50"
                            >
                                {isSearching ? '...' : 'Send'}
                            </button>
                        </form>
                    </div>
                </motion.div>
            )}

            {activeTab === 'graph' && (
                <motion.div 
                    key="graph"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-6"
                >
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">Universal Logic Topology</div>
                        <button 
                            onClick={() => fetchNodes(true)}
                            className="p-2 hover:bg-black/5 rounded-full transition-colors"
                        >
                            <RefreshCw size={14} className="opacity-50" />
                        </button>
                    </div>
                    <KnowledgeGraph data={nodeList} />
                </motion.div>
            )}

            {activeTab === 'input' && (
                <motion.div 
                    key="input"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                    <div className="lg:col-span-5 space-y-8">
                        <div className="bg-white rounded-[40px] p-8 shadow-sm border border-black/[0.03]">
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 opacity-30">Knowledge Intake</h2>
                            <textarea 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="မောင်မောင်သည် ကျောင်းသားဖြစ်သည်။"
                                className="w-full h-48 bg-[#F3F4F7] border-none rounded-3xl p-6 text-sm focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"
                            />
                            <button 
                                onClick={handleLearn}
                                disabled={loading || !inputText}
                                className="w-full mt-6 bg-[#1A1A1E] text-white py-4 rounded-2xl font-bold text-xs tracking-widest uppercase hover:bg-black transition-all flex items-center justify-center gap-3"
                            >
                                {loading ? 'Syncing...' : 'Update Cortex'}
                            </button>
                        </div>

                        <div className="bg-white rounded-[40px] p-8 shadow-sm border border-black/[0.03]">
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-6 opacity-30">Active Nodes ({nodeList.length})</h2>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto scroller">
                                {nodeList.map((n, i) => (
                                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold">{n.id}</span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-7 space-y-8">
                        <div className="bg-[#1A1A1E] rounded-[40px] p-10 font-mono text-[10px] text-green-400 overflow-hidden shadow-2xl border border-white/5">
                            <div className="flex items-center gap-2 mb-6 text-white/40 border-b border-white/5 pb-4">
                                <Terminal size={14} />
                                <span className="uppercase tracking-widest">Logic Kernel Logs</span>
                            </div>
                            <div className="h-64 overflow-y-auto scroller space-y-2">
                                {logs.map((l, i) => (
                                    <div key={i} className="flex gap-4">
                                        <span className="opacity-20">[{l.time}]</span>
                                        <span>{l.msg}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/[0.03]">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 opacity-30 text-[10px] font-bold uppercase tracking-[0.3em]">
            <span>Symbolic Cognitive Engine</span>
            <span>Myanmar NLP Core Integrated</span>
            <span>© 2026 LogicTree AI</span>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@1,400;1,700&display=swap');
        
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .font-serif {
          font-family: 'Playfair Display', serif;
        }

        .scroller::-webkit-scrollbar {
          width: 4px;
        }
        .scroller::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
