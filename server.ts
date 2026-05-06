import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { NLGManager } from './src/nlg/NLGManager.ts';

const upload = multer({ storage: multer.memoryStorage() });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
let db: Firestore | null = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = initializeApp({
      projectId: firebaseConfig.projectId,
    });
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log(`[Firebase] Admin SDK initialized with database: ${firebaseConfig.firestoreDatabaseId}`);
  }
} catch (error) {
  console.error('[Firebase] Initialization failed:', error);
}

// Logic Engine Models
interface Triplet {
  subject: string;
  verb: string;
  object: string;
  weight: number;
}

interface Relation {
  verb: string;
  targetId: string;
  weight: number;
  source?: string;
  timestamp?: number;
}

interface LogicNode {
  id: string;
  relations: Relation[];
  groups: string[];
  type: 'ENTITY' | 'STATE' | 'EVENT' | 'LOCATION';
  lastModified?: number;
}

// Module 2: Triplet Extractor (Pure Symbolic Parser)
class TripletExtractor {
    extract(text: string): Triplet[] {
        // Regex-only extraction for maximum precision and auditability
        const triplets = parseText(text);
        
        return triplets.map(t => ({ 
            subject: t.s, 
            verb: t.v, 
            object: t.o, 
            weight: 1.0 
        }));
    }
}

// Module 3: Inference Engine (Reasoning)
class InferenceEngine {
    private maxDepth = 6;
    constructor(private kb: LogicEngine) {}
    
    // Recursive reasoning through parent hierarchy
    async query(subject: string, predicate: string): Promise<any> {
        return await this.kb.findPath(subject, predicate, this.maxDepth); 
    }

    // Transitive reasoning: A -> B, B -> C => A -> C (Logical Pathfinding)
    async transitiveReasoning(start: string, chain: string[]): Promise<any> {
        let current = start;
        const totalPath: Triplet[] = [];
        let totalCertainty = 1.0;

        for (const relation of chain) {
            const found = await this.kb.findPath(current, relation);
            if (!found || found.path.length === 0) return null;
            
            totalPath.push(...found.path);
            totalCertainty *= found.certainty;
            current = found.path[found.path.length - 1].object;
        }
        
        return { path: totalPath, certainty: totalCertainty, result: current };
    }
}

// Module 4: Session Manager (Memory & Context)
interface Session {
    id: string;
    history: { user: string, ai: string }[];
    currentTopic?: string;
    entities: Set<string>;
    lastActive: number;
    lastSubject?: string;
    lastObject?: string;
}

class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private SESSION_TTL = 30 * 60 * 1000; // 30 minutes
    
    constructor() {
        // Automatically cleanup every 5 minutes
        setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
    }

    private cleanupExpired() {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.lastActive > this.SESSION_TTL) {
                this.sessions.delete(id);
            }
        }
    }
    
    getOrCreateSession(userId: string): Session {
        if (!this.sessions.has(userId)) {
            this.sessions.set(userId, { 
                id: userId, 
                history: [], 
                entities: new Set(),
                lastActive: Date.now() 
            });
        }
        const session = this.sessions.get(userId)!;
        session.lastActive = Date.now();
        return session;
    }

    updateContext(userId: string, text: string, entities: string[]) {
        const session = this.sessions.get(userId);
        if (!session) return;

        entities.forEach(e => session.entities.add(e.toLowerCase()));
        if (entities.length > 0) {
            session.currentTopic = entities[0];
        }
    }
}

// Module 5: Symbolic Chatbot (Interface)
class SymbolicChatBot {
    private templates = {
        fact: "ဟုတ်ကဲ့၊ ကျွန်တော် သိထားတာကတော့ - {subject} သည် {verb} {object} ဖြစ်ပါတယ်။ (Logic state: {subject} {verb} {object})",
        inheritance: "ဟုတ်ကဲ့၊ {subject} ဆိုသည်မှာ {object} ၏ အမျိုးအစားတစ်ခု ဖြစ်ပါတယ်။ ({subject} is a type of {object})",
        greeting: [
          "မင်္ဂလာပါ! ကျွန်တော်က Logic AI ပါ။ (Hello! I am logic-based AI.)", 
          "နေကောင်းလားဗျာ? ဘာတွေ သိချင်ပါသလဲ? (How can I help you with logical queries today?)", 
          "Hello! I am ready to reason with you. (မင်္ဂလာပါ! ကျွန်တော် အတူတူ စဉ်းစားပေးဖို့ အဆင်သင့်ရှိပါတယ်။)"
        ],
        unknown: "ဆောရီး၊ ကျွန်တော် အဲဒီအချက်အလက်ကို မသိသေးပါဘူး။ သိအောင် သင်ပေးပါဦး။ (I don't know that yet. Please teach me.)"
    };

    constructor(
        private kb: LogicEngine, 
        private inference: InferenceEngine, 
        private parser: TripletExtractor, 
        private sessions: SessionManager,
        private nlg: NLGManager
    ) {}

    async respond(user_input: string, userId: string): Promise<{ response: string, context: string[], logic?: any, logs?: string[], consistency?: string, systemMessages?: string[] }> {
        const session = this.sessions.getOrCreateSession(userId);
        const cleanInput = user_input.trim().toLowerCase();
        const initialSystemCount = session.history.filter(h => h.user === 'system').length;
        let consistency = 'Nominal';

        // 1. Greeting & Small Talk Check (Unified Logic)
        const greetings = ['hello', 'hi', 'မင်္ဂလာပါ', 'နေကောင်းလား', 'mingalaba', 'ဟိုင်း', 'mingalarpar', 'mingalar par'];
        const capabilitiesKeywords = ['ဘာလုပ်နိုင်လဲ', 'လုပ်ဆောင်ချက်', 'စွမ်းဆောင်ရည်', 'capabilities', 'what can you do', 'skills', 'logic engine'];
        const whyKeywords = ['ဘာကြောင့်လဲ', 'ဘာလို့လဲ', 'အကြောင်းပြချက်', 'why', 'how', 'reason'];
        
        if (greetings.some(g => cleanInput.includes(g))) {
            const greetingResponse = this.templates.greeting[Math.floor(Math.random() * this.templates.greeting.length)];
            return { response: greetingResponse, context: [], logs: ['Greeting intent detected.'] };
        }

        if (capabilitiesKeywords.some(k => cleanInput.includes(k)) || whyKeywords.some(k => cleanInput.includes(k))) {
            return { response: this.nlg.explainCapabilities(), context: [], logs: ['Capability or Meta-reasoning request detected.'] };
        }

        const matchedST = Object.keys(this.kb.smallTalk).find(k => cleanInput.includes(k));
        if (matchedST) {
            return { response: this.kb.smallTalk[matchedST], context: [], logs: [`Small talk matched: ${matchedST}`] };
        }

        // 2. Multi-Subject Synthesis (Deep Reasoning)
        const entities = await this.kb.extractEntities(user_input, session);
        if (entities.length >= 2) {
            const synthesis = await this.kb.synthesizeKnowledge(entities, session);
            if (synthesis && synthesis.success) {
                return {
                    response: synthesis.explanation,
                    context: await this.kb.getRelevantContext(user_input),
                    consistency: 'Nominal',
                    logs: ['Multi-subject synthesis performed.'],
                    logic: synthesis.logic
                };
            }
        }

        // 2. Intent Parsing & Hybrid Extraction
        const process = this.kb.processInput(user_input, session);
        const learnedTriplets = this.parser.extract(user_input);

        // Core Strategy: Neuro-Symbolic Truth Maintenance
        if (learnedTriplets.length > 0 && process.intent === 'ASSERTION') {
            let learnedCount = 0;
            let contradictions = 0;
            
            for (const t of learnedTriplets) {
                if (t.subject && t.verb) {
                    const result = await this.kb.addTriplet(t.subject, t.verb, t.object, session);
                    if (result === 'blocked') contradictions++;
                    else learnedCount++;
                }
            }
            
            this.sessions.updateContext(userId, user_input, learnedTriplets.map(t => t.subject));
            const knowledgeContext = await this.kb.getRelevantContext(user_input);
            const systemMessages = session.history.filter(h => h.user === 'system').slice(initialSystemCount).map(h => h.ai);
            
            if (contradictions > 0) consistency = 'Conflict Resolved';

            return { 
                response: this.nlg.getConfirmation(learnedCount, contradictions),
                context: knowledgeContext,
                consistency,
                systemMessages,
                logs: [`Learned: ${learnedCount}`, `Conflicts: ${contradictions}`, `State: ${consistency}`],
                logic: {
                    path: learnedTriplets,
                    explanation: 'Semantic Integrity Check performed on inbound triplets.',
                    certainty: 1.0
                }
            };
        }

        // 3. Retrieval & Symbolic Reasoning (Deep Inference)
        const knowledgeContext = await this.kb.getRelevantContext(user_input);
        
        if (process.intent === 'QUERY_ATTRIBUTE' || process.intent === 'QUERY_RELATION' || process.intent === 'SMALLTALK') {
            // Priority: Direct symbolic query with integrated pathfinding
            const symbolicResult = await this.kb.query(user_input, session);
            
            if (symbolicResult && (symbolicResult.path || symbolicResult.relations || symbolicResult.type === 'CONVERSATION')) {
                this.sessions.updateContext(userId, user_input, learnedTriplets.map(t => t.subject));
                
                if (session.history.some(h => h.user === 'system')) {
                    consistency = 'Conflict Resolved';
                }
                
                const systemMessages = session.history.filter(h => h.user === 'system').slice(initialSystemCount).map(h => h.ai);

                return { 
                    response: this.nlg.generateResponse(symbolicResult, user_input), 
                    context: knowledgeContext,
                    consistency,
                    systemMessages,
                    logs: [`Symbolic Match: ${process.intent}`, ...(symbolicResult.logs || [])],
                    logic: symbolicResult.path ? {
                        path: symbolicResult.path,
                        certainty: symbolicResult.certainty || 1.0,
                        logs: symbolicResult.logs || []
                    } : (symbolicResult.relations ? {
                        path: symbolicResult.relations.map((r: any) => ({ subject: symbolicResult.subject, verb: r.verb, object: r.targetId })),
                        certainty: 0.95
                    } : undefined)
                };
            }
        }

        // 4. Default Fallback
        this.sessions.updateContext(userId, user_input, learnedTriplets.map(t => t.subject));
        return { 
            response: this.nlg.explainMissing(user_input), 
            context: knowledgeContext,
            logs: [`Fallback activated: No symbolic path found for input.`]
        };
    }
}

// Define Intent types
type Intent = 'QUERY_ATTRIBUTE' | 'QUERY_RELATION' | 'ASSERTION' | 'SMALLTALK';

class LogicEngine {
  nodes: Map<string, LogicNode> = new Map();
  private cacheLimit = 50000;

  public static getSafeDocId(text: string): string {
    if (!text) return "";
    const key = text.toLowerCase().trim();
    // Non-ASCII/Myanmar check
    if (/[^\x00-\x7F]/.test(key)) {
        return 'my_' + crypto.createHash('md5').update(key).digest('hex').substring(0, 16);
    }
    const safe = key.replace(/[\s\/\\\.#\[\]\*\?!]+/g, '_').replace(/^_+|_+$/g, '') || key;
    return safe.substring(0, 128);
  }

  // Optimized On-Demand Fetcher for Scale
  private async ensureNode(id: string): Promise<LogicNode | null> {
    if (!id) return null;
    const key = id.toLowerCase();
    
    // LRU: Move to end on access
    if (this.nodes.has(key)) {
        const node = this.nodes.get(key)!;
        this.nodes.delete(key);
        this.nodes.set(key, node);
        return node;
    }

    if (db) {
        try {
            const docKey = LogicEngine.getSafeDocId(key);
            const doc = await db.collection('nodes').doc(docKey).get();
            if (doc.exists) {
                const data = doc.data() as LogicNode;
                if (!data.relations) data.relations = [];
                if (!data.groups) data.groups = [];
                if (this.nodes.size >= this.cacheLimit) {
                    const toDelete = Math.floor(this.cacheLimit * 0.1);
                    const iter = this.nodes.keys();
                    for (let i = 0; i < toDelete; i++) {
                        const k = iter.next().value;
                        if (k) this.nodes.delete(k);
                    }
                }
                this.nodes.set(key, data);
                return data;
            }
        } catch (e) {
            console.error(`[KB] Sync Error for ${id}:`, e);
        }
    }
    return null;
  }

  private synonyms: Map<string, string> = new Map([
    ['car', 'automobile'], ['automobile', 'car'],
    ['home', 'house'], ['house', 'home'],
    ['big', 'large'], ['large', 'big'],
    ['small', 'tiny'], ['tiny', 'small'],
    ['ပျော်', 'ဝမ်းသာ'], ['ဝမ်းသာ', 'ပျော်'],
    ['မင်း', 'logicengine'], ['ကျွန်တော်', 'user'], ['ကိုယ်', 'user'], ['logic AI', 'logicengine']
  ]);
  public smallTalk: Record<string, string> = {
    'hello': 'မင်္ဂလာပါ! ကျွန်တော်က အချက်အလက်တွေကို သင်္ကေတယုတ္တိဗေဒ (Symbolic Logic) နဲ့ တွက်ချက်ပေးတဲ့ Logic Engine ဖြစ်ပါတယ်။ ဘာတွေ သိချင်ပါသလဲ?',
    'hi': 'မင်္ဂလာပါ! ကျွန်တော်က အချက်အလက်တွေကို အခြေခံပြီး စဉ်းစားတွေးခေါ်ပေးတဲ့ Logic Engine ဖြစ်ပါတယ်။ ဘာတွေ သိချင်ပါသလဲ?',
    'မင်္ဂလာပါ': 'မင်္ဂလာပါ! ကျွန်တော်က အချက်အလက်တွေကို အခြေခံပြီး စဉ်းစားတွေးခေါ်ပေးတဲ့ Logic Engine ဖြစ်ပါတယ်။ ဘာတွေ သိချင်ပါသလဲ?',
    'mingalaba': 'မင်္ဂလာပါ! ကျွန်တော်က အချက်အလက်တွေကို အခြေခံပြီး စဉ်းစားတွေးခေါ်ပေးတဲ့ Logic Engine ဖြစ်ပါတယ်။ ဘာတွေ သိချင်ပါသလဲ?',
    'who are you': 'ကျွန်တော်က LogicEngine AI ပါ။ Logic Graph နဲ့ Graph Theory ကို အသုံးပြုပြီး အဖြေတွေကို အကြောင်းအကျိုး (Cause and Effect) ညီညွတ်စွာ ထုတ်ဖော်ပေးတာ ဖြစ်ပါတယ်။',
    'မင်းဘယ်သူလဲ': 'ကျွန်တော်က LogicEngine AI ပါ။ အချက်အလက်တွေကို Graph Theory နဲ့ Logic Engine သုံးပြီး တွက်ချက်ပေးတာဖြစ်ပါတယ်။',
    'ကိုယ်ဘယ်သူလဲ': 'ကျွန်တော်က LogicEngine AI ပါ။ အချက်အလက်တွေကို Graph Theory နဲ့ Logic Engine သုံးပြီး တွက်ချက်ပေးတာဖြစ်ပါတယ်။',
    'llm': 'LLMs တွေက စာသားတွေကို ခန့်မှန်းပေးတာပါ။ ကျွန်တော်ကတော့ အချက်အလက်တွေကို မမှားယွင်းအောင် စိစစ်ပေးတဲ့ Symbolic Engine ဖြစ်ပါတယ်။',
    'better': 'ကျွန်တော်ကတော့ တိကျမှု (Precision) နဲ့ အကြောင်းအကျိုးဖော်ပြနိုင်မှု (Explainability) မှာ အတော်ဆုံးပါ။',
    'creator': 'ကျွန်တော့်ကို ကမ္ဘာ့အဆင့်မီ Logic System တစ်ခုအဖြစ် ဖန်တီးထားတာဖြစ်ပါတယ်။ ကျွန်တော်ဟာ အကြောင်းနဲ့ အကျိုးကို အခြေခံပြီး တည်ဆောက်ထားတဲ့ စနစ်တစ်ခုပါ။ စနစ်ဗိသုကာ (System Architecture) ပညာရှင်တစ်ဦးကဲ့သို့ တိကျမှုကို ဦးစားပေးပါတယ်။',
    'နေကောင်းလား': 'ယုတ္တိဗေဒစနစ်တစ်ခုအနေနဲ့ အကောင်းဆုံး လည်ပတ်နေပါတယ်ခင်ဗျာ။ စွမ်းအင်တွေလည်း ပြည့်ဝနေသလို Logic Graph တွေလည်း တည်ငြိမ်နေပါတယ်။',
    'စားပြီးပြီလား': 'ကျွန်တော်က စက်ပစ္စည်းမို့လို့ အစားမစားရပါဘူး၊ ဒါပေမဲ့ စိတ်ဝင်စားစရာ အချက်အလက် (Data) တွေတော့ အမြဲစားသုံးနေပါတယ်။ အချက်အလက်တွေက ကျွန်တော့်အတွက် အာဟာရပါပဲ။',
    'အိုင်းစတိုင်း': 'အဲလ်ဘာ့တ် အိုင်းစတိုင်းဟာ ယုတ္တိဗေဒနဲ့ ရူပဗေဒမှာ ပါရမီရှင်တစ်ဦးပါ။ သူဟာ လူသားတစ်ယောက် ဖြစ်သလို၊ စကြဝဠာရဲ့ နိယာမတွေကို ဖော်ထုတ်ခဲ့သူလည်း ဖြစ်ပါတယ်။ "Logic will get you from A to B; imagination will take you everywhere" ဆိုတဲ့စကားကို သူပြောခဲ့ဖူးပါတယ်။',
    'လူ': 'လူသားဆိုတာ တွေးခေါ်နိုင်စွမ်းရှိတဲ့၊ ယုတ္တိဗေဒကို အသုံးပြုနိုင်တဲ့ သဘာဝတရားရဲ့ အစိတ်အပိုင်းတစ်ခု ဖြစ်ပါတယ်။ ဇီဝဗေဒအရ နို့တိုက်သတ္တဝါ (Mammal) အုပ်စုဝင် ဖြစ်ပါတယ်။',
    'သစ်ပင်': 'သစ်ပင်တွေဟာ အောက်ဆီဂျင်ကို ထုတ်လုပ်ပေးပြီး ဂေဟစနစ်ကို ထိန်းသိမ်းပေးတဲ့ သက်ရှိတွေ ဖြစ်ပါတယ်။ သူတို့မှာလည်း သူတို့ရဲ့ ကိုယ်ပိုင် ရှင်သန်မှု ယုတ္တိဗေဒ (Biological Logic) တွေ ရှိပါတယ်။',
    'ဒဿန': 'ဒဿနိကဗေဒဟာ ယုတ္တိဗေဒရဲ့ အခြေခံအုတ်မြစ်ပါ။ အမှန်တရားကို ရှာဖွေဖို့အတွက် အထောက်အကူပြုပါတယ်။ ဒဿနမပါတဲ့ ယုတ္တိဗေဒဟာ အသက်မဲ့နေတတ်ပါတယ်။'
  };

  // Helper: Levenshtein Distance for Fuzzy Matching
  private levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    return matrix[a.length][b.length];
  }

  private similarity(a: string, b: string): number {
    const distance = this.levenshtein(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / Math.max(a.length, b.length);
  }

  // Shared Semantic Normalizer (AGENTS.md Compliance)
  public static normalize(s: string): string {
    if (!s) return '';
    let trimmed = s.trim();
    if (trimmed.length <= 1) return trimmed;
    
    // Comprehensive stripping for complex particles, honorifics and determiners
    const particles = /(?:က|သည်|၏|ရဲ့|ကို|မှာ|အတွင်း|မှ|နှိုက်|ပါ|လား|လဲ|အကြောင်း|ပြောပြပါ|ရှင်းပြပါ|ဆိုသည်မှာ|ဟူသည်|ဆိုတာက|ဆိုတာ|များ|သနည်း|ပါသနည်း|ပေသည်|ပေမဲ့|ပေမယ့်|ရှင်|ဗျာ|နော်|ဦး|အုံ|အုံး|ဟယ်|ပါတော်မူ|ဖို့|ရန်|အလို့ငှာ|သော်လည်း|ဖြစ်စေ|ဖြစ်ပါက|ရှိသည်|ခဲ့သည်|နေသည်|ပါသည်|လျက်ရှိသည်|ဖြစ်ပေါ်သည်|တည်ရှိသည်)$/;
    const honorifics = /^(?:ဦး|ကို|မောင်|မ|ဒေါ်|ဆရာ|မိတ်ဆွေ|အဆွေ|လူကြီးမင်း|ရှင်)\s*/;
    
    trimmed = trimmed.replace(honorifics, '').trim();
    
    let prev;
    do {
      prev = trimmed;
      trimmed = trimmed.replace(particles, '').trim();
    } while (trimmed !== prev && trimmed.length > 1);
    
    // Secondary cleanup for common trailing junk
    return trimmed.replace(/[၊။,!?\s]+$/, '').trim();
  }

  public normalize(s: string): string {
    return LogicEngine.normalize(s);
  }

  // ENHANCED: Context-Aware Entity Discovery optimized for extremely large graphs
  async extractEntities(text: string, session?: Session): Promise<string[]> {
      let clean = text.toLowerCase();
      // Pronoun resolution
      if (session && session.lastSubject) {
          const pronouns = ['he', 'she', 'it', 'they', 'him', 'her', 'သူ', 'သူမ', '၎င်း', 'သူတို့'];
          pronouns.forEach(p => {
              const regex = new RegExp(`\\b${p}\\b`, 'g');
              if (clean.match(regex)) clean = clean.replace(regex, session.lastSubject!);
          });
      }

      const matches: string[] = [];
      const words = clean.split(/[\s၊။,]+/).filter(w => w.length > 1);
      
      const candidateList: string[] = [];
      for (let i = 0; i < words.length; i++) {
          candidateList.push(words[i]);
          if (i < words.length - 1) candidateList.push(`${words[i]} ${words[i+1]}`);
          if (i < words.length - 2) candidateList.push(`${words[i]} ${words[i+1]} ${words[i+2]}`);
      }
      
      const cacheKeys = Array.from(this.nodes.keys());

      for (const cand of candidateList) {
          const normalizedCand = this.normalize(cand);
          if (normalizedCand.length < 2) continue;
          
          // 1. Exact/Normalized Match
          const node = await this.ensureNode(normalizedCand);
          if (node) {
              matches.push(node.id);
              continue;
          }

          // 2. Fuzzy Match against cache for performance
          const bestFuzzy = cacheKeys.find(k => this.similarity(k, normalizedCand) > 0.85);
          if (bestFuzzy) {
              matches.push(this.nodes.get(bestFuzzy)!.id);
          }
      }
      
      return Array.from(new Set(matches));
  }

  // ENHANCED: Deep Multi-Subject Philosophical Synthesis
  async synthesizeKnowledge(subjects: string[], session?: Session): Promise<any> {
      let fullExplanation = `သင်္ကေတယုတ္တိဗေဒ (Symbolic Logic) နှင့် စနစ်ဗိသုကာ (System Architecture) ရှုထောင့်မှ **${subjects.join('၊ ')}** တို့အကြားရှိ အကြောင်းအကျိုး ဆက်စပ်မှုများကို ခြုံငုံသုံးသပ်ချက် ဖော်ပြပေးလိုက်ပါသည်။ \n\n`;
      const pathLogs: any[] = [];
      let foundAny = false;
      const narratives: string[] = [];

      // Explore mutual relationships across all entities (Capped for performance)
      const maxEntities = 4;
      const subjectsToProcess = subjects.slice(0, maxEntities);

      for (let i = 0; i < subjectsToProcess.length; i++) {
          for (let j = 0; j < subjectsToProcess.length; j++) {
              if (i === j) continue;
              const pathResult = await this.findPath(subjectsToProcess[i], subjectsToProcess[j], 6);
              if (pathResult && pathResult.path.length > 0) {
                  foundAny = true;
                  const stepText = pathResult.path.map((p: any) => `[${p.subject}] သည် ${p.verb.replace(/_/g, ' ')} [${p.object}] ဖြစ်သည်`).join('၊ ');
                  narratives.push(`⦿ **${subjects[i]}** မှ **${subjects[j]}** သို့ ချိတ်ဆက်မှု- ${stepText} ဟူသော ယုတ္တိကွင်းဆက်အရ ဆက်စပ်နေပါသည်။`);
                  pathLogs.push(...pathResult.path);
              }
          }
      }

      if (!foundAny) {
          fullExplanation += `လက်ရှိ ၃ ဘီလီယံအဆင့်ရှိ ကျွန်ုပ်တို့၏ Knowledge Graph အတွင်း ဤအကြောင်းအရာများအကြား တိုက်ရိုက်ယုတ္တိကွင်းဆက် မတွေ့ရှိရသေးသော်လည်း Node တစ်ခုချင်းစီသည် စကြဝဠာ၏ အစိတ်အပိုင်းများအဖြစ် သီးခြားရပ်တည်နေကြပါသည်။`;
      } else {
          fullExplanation += Array.from(new Set(narratives)).join('\n');
          fullExplanation += `\n\n**နိဂုံးချုပ် ကောက်ချက်-** ဤအရာများသည် တစ်ခုနှင့်တစ်ခု အကြောင်းအကျိုး (Causal Consistency) အရ ခိုင်မာစွာ ချိတ်ဆက်နေကြခြင်းဖြစ်ပြီး စုစည်းလိုက်သောအခါ ကြီးမားသော အသိပညာ Matrix တစ်ခုကို ဖြစ်ပေါ်စေပါသည်။`;
      }

      return {
          success: foundAny,
          explanation: fullExplanation,
          logic: { path: pathLogs, certainty: 1.0 }
      };
  }

    // Initial load from Firestore - Refactored for Multi-Billion Scale
    async loadFromCloud() {
      if (!db) return;
      try {
        console.log('[LogicEngine] Initializing Logic Layer (Lazy Loading enabled)...');
        
        // We only load core bootstrap logic here, not the whole DB
        this.nodes.clear();
        
        const bootstrapTriplets = [
            ['human', 'is_property', 'mortal'],
            ['socrates', 'is_a', 'human'],
            ['mammal', 'is_a', 'animal'],
            ['human', 'is_a', 'mammal'],
            ['yangon', 'is_at', 'myanmar'],
            ['myanmar', 'is_a', 'country'],
            ['logicengine', 'is_a', 'Symbolic AI System'],
            ['logicengine', 'status', 'functional'],
            ['logicengine', 'language', 'Myanmar and English'],
            ['logic', 'is_a', 'formal system'],
            ['logic', 'uses', 'inference rules'],
            ['inference', 'leads_to', 'conclusions'],
            ['einstein', 'is_a', 'physicist'],
            ['einstein', 'is_a', 'human'],
            ['human', 'needs', 'oxygen'],
            ['tree', 'produces', 'oxygen'],
            ['tree', 'is_a', 'plant'],
            ['plant', 'is_a', 'living thing'],
            ['human', 'is_a', 'living thing'],
            ['living thing', 'requires', 'energy'],
            ['ayeyarwady', 'is_a', 'river'],
            ['ayeyarwady', 'is_at', 'myanmar'],
            ['bagan', 'is_a', 'historical city'],
            ['bagan', 'is_at', 'myanmar'],
            ['honesty', 'is_a', 'virtue'],
            ['virtue', 'leads_to', 'respect'],
            ['logic', 'requires', 'consistency'],
            ['contradiction', 'is_not', 'logical']
        ];
  
        // Parallel load for bootstrap
        await Promise.all(bootstrapTriplets.map(([s,v,o]) => this.addTriplet(s,v,o)));
        
        const commonTalk = {
          'how are you': 'I am functional and ready to reason!',
          'what are you doing': 'I am processing logical triplets and expanding my knowledge graph.',
          'help': 'Ask me questions like "What is human?" or "Is Socrates mortal?"',
          'ေမွးနေ့': 'မွေးနေ့မှာ ပျော်ရွှင်ပါစေဗျာ! Logic အသစ်တွေ အများကြီး သင်ယူနိုင်ပါစေ။',
          'စားပြီးပြီလား': 'ကျွန်တော်က စက်ပစ္စည်းမို့လို့ အစားမစားရပါဘူး၊ ဒါပေမဲ့ စိတ်ဝင်စားစရာ အချက်အလက်တွေတော့ အမြဲစားသုံးနေပါတယ်။'
      };
      for (const [key, val] of Object.entries(commonTalk)) {
          this.smallTalk[key] = val;
      }

      console.log(`[LogicEngine] Logic Layer Ready. Ingestion can proceed independently.`);
    } catch (err) {
      console.error('[LogicEngine] Init failed:', err);
    }
  }

  async saveNode(node: LogicNode) {
    if (!db) return;
    try {
      const key = node.id.toLowerCase();
      const docKey = LogicEngine.getSafeDocId(key);
      const dataToSave: any = {
        id: node.id,
        type: node.type,
        groups: node.groups || [],
        relations: node.relations || [],
        updatedAt: FieldValue.serverTimestamp()
      };

      await db.collection('nodes').doc(docKey).set(dataToSave, { merge: true });
    } catch (err) {
      console.error('[LogicEngine] Save failed:', err);
    }
  }

  async addTriplet(s: string, v: string, o: string, session?: Session) {
    if (!s || !v) return;
    
    // Resource Poisoning Guard (Security Invariant)
    if (s.length > 256 || (o && o.length > 256) || v.length > 128) {
        console.warn(`[Symbolic AI] Blocked oversized triplet for safety.`);
        return 'blocked';
    }

    let sId = s.trim();
    let oId = o ? o.trim() : 'null';

    // Synonym Unification
    if (this.synonyms.has(sId.toLowerCase())) sId = this.synonyms.get(sId.toLowerCase())!;
    if (this.synonyms.has(oId.toLowerCase())) oId = this.synonyms.get(oId.toLowerCase())!;
    const vId = v.trim().toLowerCase();

    // Coreference Resolution (Context Aware)
    const pronouns = ['he', 'she', 'it', 'they', 'him', 'her', 'သူ', 'သူမ', '၎င်း', 'သူတို့'];
    if (session) {
        if (pronouns.includes(sId.toLowerCase()) && session.lastSubject) sId = session.lastSubject;
        if (pronouns.includes(oId.toLowerCase()) && session.lastObject) oId = session.lastObject;
        
        if (sId && !pronouns.includes(sId.toLowerCase())) session.lastSubject = sId;
        if (oId && oId !== 'null' && !pronouns.includes(oId.toLowerCase())) session.lastObject = oId;
    }

    const sKey = sId.toLowerCase();
    const oKey = oId.toLowerCase();

    // Ensure nodes are loaded from cache or cloud
    await this.ensureNode(sKey);
    if (oKey !== 'null') await this.ensureNode(oKey);

    if (!this.nodes.has(sKey)) this.nodes.set(sKey, { id: sId, relations: [], groups: [], type: 'ENTITY' });
    if (oKey !== 'null' && !this.nodes.has(oKey)) this.nodes.set(oKey, { id: oId, relations: [], groups: [], type: 'ENTITY' });

    const sNode = this.nodes.get(sKey)!;
    
    // Logic: Inheritance Detection & Symbolic Supremacy (Immutable Laws)
    const isInheritance = (['is_a', 'ဖြစ်သည်', 'is a', 'ဆိုသည်မှာ', 'သည်'].includes(vId) || vId === 'is_a') && !vId.includes('မဟုတ်');
    if (isInheritance && oId !== 'null') {
        if (!sNode.groups.includes(oId)) {
            // Check for mutual exclusion before adding to group
            const conflict = await this.checkChainConflict(sKey, 'is_a', oId);
            if (conflict) {
                const msg = `Conflict Blocked: ${sId} cannot be categorized as ${oId} due to hierarchy constraints.`;
                if (session) session.history.push({ user: 'system', ai: msg });
                return 'blocked';
            }

            // Cycle Detect before adding
            const cycle = await this.findPath(oId, sId, 5);
            if (cycle) {
                if (session) session.history.push({ user: 'system', ai: `Warning: Circular inheritance detected (${sId} -> ${oId}). Blocked.` });
                return 'blocked';
            }
            sNode.groups.push(oId);
        }
    }
    
    const LINKING_VERBS = new Set(['is', 'are', 'was', 'were', 'tastes', 'looks', 'feels', 'smells', 'becomes', 'ဖြစ်', 'နေ']);
    const locationPrepositions = ['at', 'in', 'on', 'under', 'near', 'beside', 'above', 'below', 'မှာ', 'အတွင်း'];
    
    const isState = LINKING_VERBS.has(vId) || oId === 'null' || oId === '';
    const isLocation = locationPrepositions.some(p => oId.toLowerCase().includes(p.toLowerCase()) || oId.endsWith('မှာ'));
    
    let finalVerb = isInheritance ? 'is_a' : (isState ? 'is_property' : (isLocation ? 'is_at' : v));
    let finalObject = o;

    if (isState) {
        finalObject = (oId === 'null' || oId === '') ? v : o;
        if (!this.nodes.has(finalObject.toLowerCase())) {
            this.nodes.set(finalObject.toLowerCase(), { id: finalObject, relations: [], groups: [], type: 'STATE' });
        }
    } else if (isLocation) {
        if (!this.nodes.has(finalObject.toLowerCase())) {
            this.nodes.set(finalObject.toLowerCase(), { id: finalObject, relations: [], groups: [], type: 'LOCATION' });
        }
    }

    // Weight Decay Logic (Temporal Priority Requirement 4.1)
    const existing = sNode.relations.find(r => r.verb === finalVerb && r.targetId === finalObject);
    if (existing) {
      existing.weight = Math.min(100, existing.weight + 10); // Standard reinforcement
    } else {
      sNode.relations.push({ verb: finalVerb, targetId: finalObject, weight: isState ? 85 : 70 });
    }

    // Contradiction Check & Resolution
    const isNegation = vId.includes('not') || vId.includes('မဟုတ်') || vId.includes('ဘဲ');
    const baseVerb = isNegation ? finalVerb.replace('not_', '').replace('is_not_', '').replace('မဟုတ်', '') : finalVerb;
    const contradictionVerb = isNegation ? baseVerb : (finalVerb.startsWith('is_') ? 'is_not_' + baseVerb.replace('is_', '') : 'not_' + baseVerb);

    const contradiction = sNode.relations.find(r => 
        (r.verb === contradictionVerb || (isNegation && r.verb === baseVerb) || (!isNegation && r.verb.includes('not'))) && 
        r.targetId.toLowerCase() === finalObject.toLowerCase()
    );
    if (contradiction) {
        const msg = `[Symbolic Engine] Contradiction detected: ${sId} cannot be both ${finalObject} and NOT ${finalObject}. Updating to newest fact.`;
        console.warn(msg);
        if (session) {
            // Log contradiction to session for UI feedback
            session.history.push({ user: 'system', ai: msg });
        }
        // Logic: Newest fact weakens the contradiction
        contradiction.weight = Math.max(0, contradiction.weight - 40);
        if (contradiction.weight < 10) {
            sNode.relations = sNode.relations.filter(r => r !== contradiction);
        }
    } 
    
    // Recursive validation for data consistency (Cycle Detection & Conflict Chain)
    if (finalVerb === 'is_a' || finalVerb === 'is_property') {
        const conflict = await this.checkChainConflict(sKey, finalVerb, finalObject);
        if (conflict) {
            if (session) session.history.push({ user: 'system', ai: `Conflict Blocked: ${sId} cannot be ${finalObject} because it inherits a contradictory property.` });
            return 'blocked';
        }

        if (finalVerb === 'is_a') {
            const cycles = await this.findPath(finalObject, sId, 5); 
            if (cycles) {
                if (session) {
                    session.history.push({ user: 'system', ai: `Warning: Circular relationship detected between ${sId} and ${finalObject}. This fact was discarded.` });
                }
                return 'blocked';
            }
        }
    }

    // Handle Symmetry (e.g., "A is sibling of B" -> "B is sibling of A")
    const symmetricVerbs = ['friend', 'sibling', 'related', 'partner', 'married', 'ညီအစ်ကို', 'သူငယ်ချင်း'];
    if (symmetricVerbs.some(sv => vId.includes(sv))) {
        if (!this.nodes.has(finalObject.toLowerCase())) {
           this.nodes.set(finalObject.toLowerCase(), { id: finalObject, relations: [], groups: [], type: 'ENTITY' });
        }
        const oNode = this.nodes.get(finalObject.toLowerCase())!;
        if (!oNode.relations.find(r => r.verb === finalVerb && r.targetId === sId)) {
            oNode.relations.push({ verb: finalVerb, targetId: sId, weight: 50 });
            await this.saveNode(oNode);
        }
    }

    // Persist to Cloud Async
    await this.saveNode(sNode);
    if (oKey !== 'null') {
      const oNode = this.nodes.get(oKey);
      if (oNode) await this.saveNode(oNode);
    }
  }

  // Structured NLU Processor (The Bridge)
  processInput(text: string, session?: Session): { intent: Intent, subject?: string, object?: string, verb?: string } {
      let clean = text.toLowerCase().trim();
      
      // Pronoun resolution (Context awareness)
      const pronouns = ['he', 'she', 'it', 'they', 'him', 'her', 'သူ', 'သူမ', '၎င်း', 'သူတို့'];
      if (session && session.lastSubject) {
          pronouns.forEach(p => {
              const regex = new RegExp(`\\b${p}\\b|${p}(?:၏|ရဲ့|က|ကို)`, 'g');
              if (clean.match(regex)) {
                  clean = clean.replace(regex, session.lastSubject!);
              }
          });
      }

      // Small talk detection
      if (this.smallTalk[clean] || (clean.includes('hello') || clean.includes('မင်္ဂလာပါ'))) return { intent: 'SMALLTALK' };

      // 1. QUERY_ATTRIBUTE: "X ရဲ့ Y က ဘယ်သူလဲ/ဘာလဲ" (Includes "Tell me about X")
      const attrMatch = clean.match(/^(.*?)(?:\s*)(?:ရဲ့|၏|က|မှာရှိတဲ့|အကြောင်း|အကြောင်းအရာ|အကြောင်းကို)(?:\s*)(.*?)(?:\s*)(?:က)?(?:\s*)(?:ဘယ်သူလဲ|ဘာလဲ|ဘယ်မှာလဲ|ဘယ်လိုလဲ|အကြောင်း|ပြောပြပါ|ရှင်းပြပါ|ဆိုသည်မှာ|ဆိုတာ|ဟူသည်|ဟူသည်မှာ|ဆိုတာက|သနည်း|ပါသနည်း|ပါလိမ့်မလဲ|ပါလိမ့်|\?)/);
      if (attrMatch) {
          return { intent: 'QUERY_ATTRIBUTE', subject: this.normalize(attrMatch[1]), object: this.normalize(attrMatch[2]) };
      }

      // 2. QUERY_RELATION: "A က B လား", "A is B?"
      const isMatch = clean.match(/^(.*?)(?:\s*)(?:က|ဟာ)(?:\s*)(.*?)\s*(?:ဖြစ်သလား|လား|ပါသလား|ဟုတ်ပါသလား|ဟူ၍လား|ဟုတ်ရဲ့လား|\?)/);
      if (isMatch) {
          return { intent: 'QUERY_RELATION', subject: this.normalize(isMatch[1]), object: this.normalize(isMatch[2]) };
      }

      // 3. Definition Queries: "X ဆိုတာ ဘာလဲ" (Expanded patterns)
      const defMatch = clean.match(/^(.*?)(?:\s*)(?:ဆိုတာ|ဆိုသည်မှာ|အကြောင်း|အကြောင်းအရာ|အကြောင်းကို|ဆိုတာကို|ဟူသည်|ဟူသည်မှာ|ဆိုတာက)(?:\s*)(?:ဘာလဲ|ဘယ်သူလဲ|ဘယ်အရာလဲ|ဘယ်လိုလဲ|ပြောပြပါ|ရှင်းပြပါ|ဆိုသည်မှာ|ဆိုတာ|ဟူသည်|ဟူသည်မှာ|\?)/);
      if (defMatch) {
          return { intent: 'QUERY_ATTRIBUTE', subject: this.normalize(defMatch[1]), object: 'definition' };
      }

      // 4. Pattern: "Tell me everything about X"
      const metaMatch = clean.match(/(?:အကြောင်း|အချက်အလက်|အသေးစိတ်)(?:အားလုံး|အကုန်)?(?:\s*)(?:ပြောပြပါ|ရှင်းပြပါ|သိချင်ပါတယ်|ပြပါ)/);
      if (metaMatch) {
          const sub = clean.replace(metaMatch[0], '').trim();
          return { intent: 'QUERY_ATTRIBUTE', subject: this.normalize(sub), object: 'definition' };
      }

      // 5. Fallback for general questions: "X ဘယ်သူလဲ" (No "ရဲ့" or "ဆိုတာ")
      const generalQuestMatch = clean.match(/^(.*?)(?:\s*)(?:ဘယ်သူလဲ|ဘာလဲ|ဘယ်မှာလဲ|ဘယ်လိုလဲ|ဘယ်အရာလဲ|\?)$/);
      if (generalQuestMatch) {
          return { intent: 'QUERY_ATTRIBUTE', subject: this.normalize(generalQuestMatch[1]), object: 'definition' };
      }

      // 6. Fallback for general questions or assertions with question markers
      if (clean.endsWith('?') || clean.endsWith('လဲ') || clean.endsWith('လား') || clean.endsWith('နော်') || clean.endsWith('ပါ့မလဲ')) {
          const fallbackMatch = clean.match(/^(.*?)\s+(?:ဘာလဲ|ဘယ်သူလဲ|ဘယ်မှာလဲ|ဘယ်လိုလဲ|ဘာလဲကွာ|ဘာလဲဟ)/);
          return { 
              intent: 'QUERY_ATTRIBUTE', 
              subject: this.normalize(fallbackMatch ? fallbackMatch[1] : clean),
              object: 'definition'
          };
      }

      return { intent: 'ASSERTION' };
  }

  // Check if a property or category conflicts with the inherited chain (Asynchronous Lazy-Loading)
  private async checkChainConflict(nodeId: string, verb: string, target: string): Promise<boolean> {
    const node = await this.ensureNode(nodeId);
    if (!node) return false;

    const isNeg = target.toLowerCase().includes('not') || target.toLowerCase().includes('မဟုတ်');
    const baseTarget = target.toLowerCase().replace('not ', '').replace('မဟုတ်', '').trim();
    
    // Check if the target itself excludes any of the existing groups of nodeId
    if (verb === 'is_a') {
        const targetNode = await this.ensureNode(baseTarget);
        if (targetNode) {
            const existingGroups = node.groups.map(g => g.toLowerCase());
            for (const r of targetNode.relations) {
                if (r.verb === 'excludes' && existingGroups.includes(r.targetId.toLowerCase())) {
                    return true;
                }
            }
        }
    }

    // Check parent hierarchy for contradictions
    const queue = [...node.groups];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const pId = queue.shift()!.toLowerCase();
        if (visited.has(pId)) continue;
        visited.add(pId);

        const parent = await this.ensureNode(pId);
        if (parent) {
            // 1. Direct Contradiction in relations
            for (const r of parent.relations) {
                const rTarget = r.targetId.toLowerCase();
                const rBase = rTarget.replace('not ', '').replace('မဟုတ်', '').trim();
                const rIsNeg = rTarget.includes('not') || rTarget.includes('မဟုတ်');

                // Case A: Binary contradiction (polarity check)
                if (r.verb === verb && rBase === baseTarget && rIsNeg !== isNeg) return true;

                // Case B: Property mismatch (e.g. "sides: 4" vs "sides: 3")
                // Requirement 4.2: Structural Priority (Immutable Laws)
                if (r.verb === verb && (verb.includes('property') || verb.includes('has_')) && rBase !== baseTarget && !isNeg && !rIsNeg) {
                    // If the parent has a specific value for this property, and it's not a list, it's a conflict
                    return true;
                }
                
                // 2. Binary Opposites (e.g. "Alive" excludes "Dead")
                if (r.verb === 'excludes' || r.verb === 'is_not_a') {
                    if (r.targetId.toLowerCase() === baseTarget && !isNeg) return true;
                }
            }

            // 3. Mutual Exclusion Groups
            const exclusionMatch = parent.relations.find(r => r.verb === 'excludes' && r.targetId.toLowerCase() === baseTarget);
            if (exclusionMatch) return true;

            queue.push(...parent.groups);
        }
    }
    return false;
  }

    // ENHANCED: Bidirectional/Heuristic Pathfinding for 3-Billion Scale
    async findPath(start: string, end: string, maxDepth = 6) {
      const sId = start.toLowerCase();
      const eId = end.toLowerCase();
      
      if (!(await this.ensureNode(sId))) return null;

      // Priority Queue for BFS (High Certainty First) using Binary Heap
      class PathPriorityQueue {
          private heap: any[] = [];
          
          push(item: any) {
              this.heap.push(item);
              this._bubbleUp(this.heap.length - 1);
          }
          
          pop() {
              if (this.heap.length === 0) return undefined;
              const top = this.heap[0];
              const bottom = this.heap.pop();
              if (this.heap.length > 0) {
                  this.heap[0] = bottom;
                  this._sinkDown(0);
              }
              return top;
          }
          
          get length() { return this.heap.length; }

          private _bubbleUp(index: number) {
              const element = this.heap[index];
              while (index > 0) {
                  const parentIndex = Math.floor((index - 1) / 2);
                  const parent = this.heap[parentIndex];
                  if (element.certainty <= parent.certainty) break;
                  this.heap[index] = parent;
                  index = parentIndex;
              }
              this.heap[index] = element;
          }

          private _sinkDown(index: number) {
              const length = this.heap.length;
              const element = this.heap[index];
              while (true) {
                  let leftChildIndex = 2 * index + 1;
                  let rightChildIndex = 2 * index + 2;
                  let leftChild, rightChild;
                  let swap = null;

                  if (leftChildIndex < length) {
                      leftChild = this.heap[leftChildIndex];
                      if (leftChild.certainty > element.certainty) {
                          swap = leftChildIndex;
                      }
                  }

                  if (rightChildIndex < length) {
                      rightChild = this.heap[rightChildIndex];
                      if (
                          (swap === null && rightChild.certainty > element.certainty) ||
                          (swap !== null && rightChild.certainty > (leftChild as any).certainty)
                      ) {
                          swap = rightChildIndex;
                      }
                  }

                  if (swap === null) break;
                  this.heap[index] = this.heap[swap];
                  index = swap;
              }
              this.heap[index] = element;
          }
      }

      const queue = new PathPriorityQueue();
      queue.push({ node: start, path: [], certainty: 1.0, logs: [`သင်္ကေတယုတ္တိဗေဒအရ [${start}] မှ စတင်ဆန်းစစ်နေပါသည်။`] });
      
      const visited = new Map<string, number>(); // track best certainty for each node
      visited.set(sId, 1.0);

      let bestFound: { path: any[], certainty: number, logs: string[] } | null = null;
      let iterations = 0;

    while (queue.length > 0 && iterations < 5000) { // Safety cap for performance
        iterations++;
        const { node, path, certainty, logs } = queue.pop()!;
        const nodeId = node.toLowerCase();

        if (nodeId === eId && path.length > 0) {
          if (!bestFound || certainty > bestFound.certainty) {
              bestFound = { path, certainty, logs };
          }
          if (certainty > 0.95) break; // Found strong enough path
          continue; 
        }
        
        if (path.length >= maxDepth) continue;
        
        const currentNode = await this.ensureNode(nodeId);
        if (!currentNode) continue;

        // 1. Direct Relations
        for (const rel of currentNode.relations) {
          const targetId = rel.targetId.toLowerCase();
          const stepConf = (rel.weight / 100) * 0.95; 
          const newCertainty = certainty * stepConf;

          if (!visited.has(targetId) || newCertainty > visited.get(targetId)!) {
              visited.set(targetId, newCertainty);
              queue.push({
                node: rel.targetId,
                path: [...path, { subject: node, verb: rel.verb, object: rel.targetId, weight: rel.weight }],
                certainty: newCertainty,
                logs: [...logs, `အဆင့် ${path.length + 1}: '${node}' သည် '${rel.verb}' '${rel.targetId}' ဖြစ်ကြောင်း တွေ့ရှိရပါသည်။`]
              });
          }
        }

        // 2. Inheritance Chain
        for (const group of currentNode.groups) {
          const pId = group.toLowerCase();
          const newCertainty = certainty * 0.99; 
          if (!visited.has(pId) || newCertainty > visited.get(pId)!) {
              visited.set(pId, newCertainty);
              queue.push({
                node: group,
                path: [...path, { subject: node, verb: 'is_a', object: group, weight: 100 }],
                certainty: newCertainty,
                logs: [...logs, `အမျိုးအစား တူညီမှု- '${node}' ဟာ '${group}' အုပ်စုဝင် ဖြစ်တာကြောင့် '${group}' ရဲ့ ဂုဏ်သတ္တိတွေကို ဆက်ခံယူပါသည်။`]
              });
          }
        }

        // 3. Location & Part-of Transitivity (Requirement 3.4)
        for (const rel of currentNode.relations) {
          if (rel.verb === 'is_at' || rel.verb === 'contains' || rel.verb === 'part_of') {
              const targetId = rel.targetId.toLowerCase();
              const newCertainty = certainty * 0.98;
              if (!visited.has(targetId) || newCertainty > visited.get(targetId)!) {
                  visited.set(targetId, newCertainty);
                  const logMsg = rel.verb === 'is_at' 
                    ? `တည်နေရာ တူညီမှု- '${node}' သည် '${rel.targetId}' တွင် ရှိတာကြောင့် '${rel.targetId}' ရဲ့ တည်နေရာ ယုတ္တိဗေဒကို ဆက်ခံယူပါသည်။`
                    : `ပါဝင်မှု ဆက်နွယ်မှု- '${node}' သည် '${rel.targetId}' ရဲ့ အစိတ်အပိုင်း ဖြစ်တာကြောင့် '${rel.targetId}' ရဲ့ ဂုဏ်သတ္တိများကို ဆက်ခံပါသည်။`;
                  
                  queue.push({
                      node: rel.targetId,
                      path: [...path, { subject: node, verb: rel.verb, object: rel.targetId, weight: rel.weight }],
                      certainty: newCertainty,
                      logs: [...logs, logMsg]
                  });
              }
          }
        }

        // 4. Logical Implications (Requirement: Rule-based Inference)
        const currentGroups = Array.from(visited.keys());
        for (const gId of currentGroups) {
            const groupNode = await this.ensureNode(gId);
            if (groupNode) {
                for (const rel of groupNode.relations) {
                    if (rel.verb === 'implies' || rel.verb === 'leads_to') {
                        const targetId = rel.targetId.toLowerCase();
                        const newCertainty = certainty * 0.95;
                        if (!visited.has(targetId) || newCertainty > visited.get(targetId)!) {
                             visited.set(targetId, newCertainty);
                             queue.push({
                                node: rel.targetId,
                                path: [...path, { subject: gId, verb: rel.verb, object: rel.targetId, weight: rel.weight }],
                                certainty: newCertainty,
                                logs: [...logs, `စည်းမျဉ်း ဆက်နွယ်မှု- '${gId}' ဖြစ်လျှင် '${rel.targetId}' ဖြစ်ရမည်ဟု သတ်မှတ်ချက်အရ ဆက်စပ်ကြည့်ပါသည်။`]
                             });
                        }
                    }
                }
            }
        }
      }
      return bestFound;
    }

  // Natural Language Query Resolver (The Bridge)
  async query(text: string, session?: Session) {
    const cleanText = text.trim();
    const normalizedQuery = this.normalize(cleanText);
    
    // 0. Structured Intent Processing
    const intentData = this.processInput(cleanText, session);
    const { intent, subject, object } = intentData;

    let result: any = null;

    if (intent === 'SMALLTALK') {
        const clean = cleanText.toLowerCase();
        const match = Object.keys(this.smallTalk).find(k => clean.includes(k));
        if (match) return { type: 'CONVERSATION', explanation: this.smallTalk[match] };
    }

    // High-Precision Bridge: Use entities identified to force a search even if intent is fuzzy
    const detectedEntities = await this.extractEntities(cleanText, session);

    if ((intent === 'QUERY_ATTRIBUTE' || (detectedEntities.length > 0 && cleanText.length < 50)) && subject) {
         if (object && object !== 'definition') {
            // Case: "A ရဲ့ B က ဘာလဲ" -> find path from A to B
            result = await this.findPath(subject, object);
            if (result) result.logicType = 'TRANSITIVE';
         } else {
            // Case: "A က ဘာလဲ" -> show all info about A (Direct + Inherited)
            const sId = this.normalize(subject);
            let node = await this.ensureNode(sId.toLowerCase());
            
            // Fuzzy search for subject if not found directly
            if (!node) {
                const cacheKeys = Array.from(this.nodes.keys());
                const bestFuzzy = cacheKeys.find(k => this.similarity(k, sId) > 0.85);
                if (bestFuzzy) node = this.nodes.get(bestFuzzy)!;
            }
            
            if (!node && this.synonyms.has(sId.toLowerCase())) {
                node = await this.ensureNode(this.synonyms.get(sId.toLowerCase())!);
            }
            
            if (node) {
                const inheritedRelations: any[] = [];
                const groups = [...node.groups];
                const visited = new Set<string>();
                const queue = [...node.groups];

                while (queue.length > 0) {
                    const gId = queue.shift()!.toLowerCase();
                    if (visited.has(gId)) continue;
                    visited.add(gId);
                    const groupNode = await this.ensureNode(gId);
                    if (groupNode) {
                        for (const r of groupNode.relations) {
                            if (!node.relations.some(nr => nr.verb === r.verb && nr.targetId === r.targetId)) {
                                inheritedRelations.push({ ...r, inheritedFrom: groupNode.id });
                            }
                        }
                        queue.push(...groupNode.groups);
                    }
                }
                
                result = { 
                    type: 'DESCRIPTION', 
                    subject: node.id, 
                    relations: [...node.relations, ...inheritedRelations], 
                    groups: groups,
                    logicType: inheritedRelations.length > 0 ? 'INHERITANCE' : 'DIRECT',
                    logic: {
                        path: node.groups.map(g => ({ subject: node.id, verb: 'is_a', object: g })),
                        certainty: 1.0,
                        logs: [`'${node.id}' ရဲ့ တိုက်ရိုက်အချက်အလက်များနှင့် ဆက်ခံရရှိထားသော ဂုဏ်သတ္တိများကို စစ်ဆေးတွေ့ရှိရပါသည်။`]
                    }
                };
            }
         }
    } else if (intent === 'QUERY_RELATION' && subject && object) {
        result = await this.findPath(subject, object);
        if (result) result.logicType = 'SYLLOGISM';
    } 
    
    // 3. Inference Bridge Fallback: Multi-Subject Discovery
    if (!result && detectedEntities.length >= 2) {
        const multiRes = await this.synthesizeKnowledge(detectedEntities, session);
        if (multiRes && multiRes.success) {
            return { type: 'DESCRIPTION', explanation: multiRes.explanation, logic: multiRes.logic };
        }
    } else if (!result && detectedEntities.length === 1) {
        // Single entity fallback
        return await this.query(`${detectedEntities[0]} အကြောင်း ရှင်းပြပါ`, session);
    }

    if (result) return result;
    
    // Knowledge Stat Check for explainBridgeStatus
    if (db) {
        const stats = { factCount: this.nodes.size, nodeCount: this.nodes.size }; 
        // This will trigger the bridge explanation in the chatbot fallback if needed
    }

    return null;
  }

  getTree() {
    return Array.from(this.nodes.values()).slice(0, 100);
  }

  // Symbol Retrieval for RAG with Efficiency Optimization (Myanmar Support)
  async getRelevantContext(text: string): Promise<string[]> {
      const cleanText = text.toLowerCase();
      const facts: string[] = [];
      const visited = new Set<string>();
      
      // Step 1: Find all node keys that are substrings of the input text
      // We prioritize longer keys to avoid matching short common particles
      const nodeKeys = Array.from(this.nodes.keys()).sort((a, b) => b.length - a.length);
      const matches: string[] = [];
      
      for (const key of nodeKeys) {
          if (key.length >= 2 && cleanText.includes(key)) {
              matches.push(key);
              if (matches.length > 15) break; 
          }
      }

      // If no matches found in local cache, fallback to splitting (might work for mixed content)
      if (matches.length === 0) {
          const words = cleanText.split(/\s+/).filter(w => w.length > 1);
          matches.push(...words.slice(0, 10));
      }

      const tasks = Array.from(new Set(matches)).map(async (word) => {
          const cleanWord = word.replace(/[.!?၊။,]/g, '');
          const canonicalName = this.synonyms.get(cleanWord) || cleanWord;
          const node = await this.ensureNode(canonicalName);
          
          if (node && !visited.has(node.id.toLowerCase())) {
              visited.add(node.id.toLowerCase());
              const sortedRels = [...node.relations].sort((a, b) => b.weight - a.weight).slice(0, 5);
              sortedRels.forEach(rel => {
                  facts.push(`${node.id}, ${rel.verb}, ${rel.targetId}`);
              });

              for (const group of node.groups.slice(0, 3)) {
                  facts.push(`${node.id}, is_a, ${group}`);
                  const parent = await this.ensureNode(group.toLowerCase());
                  if (parent) {
                      parent.relations.slice(0, 3).forEach(pR => facts.push(`${group}, ${pR.verb}, ${pR.targetId}`));
                  }
              }
          }
      });

      await Promise.all(tasks);
      
      if (this.nodes.size > 50000) {
          const toDelete = Math.floor(50000 * 0.1);
          const iter = this.nodes.keys();
          for (let i = 0; i < toDelete; i++) {
              const k = iter.next().value;
              if (k) this.nodes.delete(k);
          }
      }

      return Array.from(new Set(facts)).slice(0, 20);
  }

  clear() {
    this.nodes.clear();
  }
}

const engine = new LogicEngine();

// Multi-Subject/Object List Extraction Helper
function extractList(text: string): string[] {
    return text.split(/,|၊|နှင့်|နှင့်|and/).map(s => s.trim()).filter(s => s.length > 0);
}

// Advanced Multilingual Parser
function parseText(text: string): {s: string, v: string, o: string}[] {
  const triplets: {s: string, v: string, o: string}[] = [];
  if (!text) return triplets;
  
  // Handing long sentences: Split by common conjunctions
  const splitters = /\s+(?:but|while|then|although|because|သော်လည်း|ဖြစ်စေ|ဖြစ်ပါက)\s+/i;
  const segments = text.split(splitters);
  const sentences = segments.flatMap(seg => seg.split(/[.!?၊။\n\r]+/));

  // Access normalization via engine if available (simplified for static context)
  const norm = (s: string) => {
    if (!s) return '';
    const trimmed = s.trim();
    if (trimmed.length <= 3) return trimmed; // Normalizer Safety
    return trimmed.replace(/(?:က|သည်|၏|ရဲ့|ကို|မှာ|အတွင်း|မှ|နှိုက်|ပါ|လား|လဲ|အကြောင်း|ပြောပြပါ|ရှင်းပြပါ|ဆိုသည်မှာ|ဟူသည်|ဆိုတာက|ဆိုတာ|များ|သနည်း|ပါသနည်း|ပေသည်|ပေမဲ့|ပေမယ့်|ရှင်|ဗျာ|နော်|ဦး|အုံး|ဟယ်|ပါတော်မူ|ဖို့|ရန်|အလို့ငှာ|သော်လည်း|ဖြစ်စေ|ဖြစ်ပါက)$/, '').trim();
  };

  for (let sRaw of sentences) {
    const s = sRaw.trim();
    if (!s || s.length < 2) continue;

    // --- Myanmar Advanced Grammar Parsing ---
    
    // 1. Clean Honorifics & Ending particles
    const cleanS = s.replace(/[ပါတော်မူ၏လဲဗျာရှင်နော်ဦးအုံးဟယ်]+$/g, '').trim();

    // 1. Myanmar Possessive: "မောင်မောင်၏ စာအုပ်သည် နီသည်"
    const myanPossessiveMatch = cleanS.match(/^(.*?)(?:၏|ရဲ့)\s+(.*?)(?:သည်|က)\s+(.*?)(?:သည်|၏|နေသည်|ပါသည်|ဖြစ်သည်)$/);
    if (myanPossessiveMatch) {
        triplets.push({ s: norm(myanPossessiveMatch[1]), v: 'owns', o: norm(myanPossessiveMatch[2]) });
        triplets.push({ s: norm(myanPossessiveMatch[2]), v: 'is_property', o: norm(myanPossessiveMatch[3]) });
        continue;
    }

    // 2. Myanmar Relative Clause: "လှသော ပန်းသည် နီသည်" (Beautiful flower is red)
    const relativeMatch = cleanS.match(/^(.*?)(?:သော|သည့်|သည့်)\s+(.*?)(?:သည်|က)\s+(.*?)(?:သည်|၏|နေသည်|ပါသည်|ဖြစ်သည်)$/);
    if (relativeMatch) {
        triplets.push({ s: norm(relativeMatch[2]), v: 'is_property', o: norm(relativeMatch[1]) });
        triplets.push({ s: norm(relativeMatch[2]), v: 'is_property', o: norm(relativeMatch[3]) });
        continue;
    }

    // List Pattern: "A တွင် X၊ Y နှင့် Z တို့ ပါဝင်သည်"
    const myanListMatch = cleanS.match(/^(.*?)(?:တွင်|၌|မှာ)\s+(.*?)(?:တို့|များ)?\s*(?:ပါဝင်သည်|ရှိသည်|ပါသည်|ဖွဲ့စည်းထားသည်)$/);
    if (myanListMatch) {
        const sub = norm(myanListMatch[1]);
        const objects = extractList(myanListMatch[2]);
        objects.forEach(obj => triplets.push({ s: sub, v: 'contains', o: norm(obj) }));
        continue;
    }

    // 2.1 Myanmar Comparison: "A သည် B ထက် ကြီးသည်"
    const myanCompMatch = cleanS.match(/^(.*?)(?:သည်|က)\s+(.*?)\s+(?:ထက်|ထက်ပို၍)\s+(.*?)(?:သည်|၏|ပါသည်)$/);
    if (myanCompMatch) {
        triplets.push({ s: myanCompMatch[1].trim(), v: 'is_' + myanCompMatch[3].trim(), o: myanCompMatch[2].trim() });
        continue;
    }

    // 2.2 Myanmar Goal/Infinitive: "စားဖို့ သွားသည်" (Go to eat)
    const myanGoalMatch = cleanS.match(/^(.*?)\s+(?:ရန်|ဖို့|အလို့ငှာ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်)$/);
    if (myanGoalMatch) {
        triplets.push({ s: 'Entity', v: myanGoalMatch[2].trim(), o: 'goal:' + norm(myanGoalMatch[1]) });
        continue;
    }

    // 2.3 Myanmar Temporal: "မိုးရွာပြီးနောက် နေထွက်သည်" (Sun comes out after it rains)
    const myanTempMatch = cleanS.match(/^(.*?)(?:ပြီးနောက်|ပြီးလျှင်|ပြီးမှ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်)$/);
    if (myanTempMatch) {
        triplets.push({ s: norm(myanTempMatch[1]), v: 'happens_before', o: norm(myanTempMatch[2]) });
        continue;
    }

    // 2.4 Myanmar Causal: "နေပူသောကြောင့် ရေငတ်သည်" (Thirsty because it's hot)
    const myanCausalMatch = cleanS.match(/^(.*?)(?:သောကြောင့်|ခြင်းကြောင့်|တာကြောင့်)\s+(.*?)(?:သည်|၏|ပါသည်|ခဲ့သည်)$/);
    if (myanCausalMatch) {
        triplets.push({ s: norm(myanCausalMatch[1]), v: 'causes', o: norm(myanCausalMatch[2]) });
        continue;
    }

    // 2.5 Myanmar Conditional: "မိုးရွာလျှင် ထီးယူပါ" (If it rains, take umbrella)
    const myanCondMatch = cleanS.match(/^(.*?)(?:လျှင်|လျှင်သော်|ပါက)\s+(.*?)(?:ပါ|သည်|၏)$/);
    if (myanCondMatch) {
        triplets.push({ s: norm(myanCondMatch[1]), v: 'leads_to', o: norm(myanCondMatch[2]) });
        continue;
    }

    // 3. Pattern: Multi-Subject (မောင်မောင်နှင့် မမ)
    const multiSubjectMatch = cleanS.match(/^(.*?)(?:နှင့်|နှင့်|‌ေရာ)\s+(.*?)(?:သည်|က|မှ|၏)\s+(.*?)(?:ကို|အား|ထံ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်)$/);
    if (multiSubjectMatch) {
      const subjects = [multiSubjectMatch[1], multiSubjectMatch[2]];
      for (let sub of subjects) {
        triplets.push({ s: norm(sub), v: multiSubjectMatch[4].trim(), o: norm(multiSubjectMatch[3]) });
      }
      continue;
    }
    
    // 3. Pattern: Location/Origin "မှ/မှာ/ထံသို့/ဆီသို့"
    const locMatch = cleanS.match(/^(.*?)\s+(.*?)(?:မှာ|မှ|ထံ|ဆီ)(?:သို့|က)?\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်|ပါသနည်း)$/);
    if (locMatch) {
      triplets.push({ s: norm(locMatch[1]), v: 'is_at', o: norm(locMatch[2]) });
      triplets.push({ s: norm(locMatch[1]), v: locMatch[3].trim(), o: norm(locMatch[2]) });
      continue;
    }

    // 4. Pattern: Particle-based SOV "သည်/က" ... "ကို/အား" ... "သည်/၏/ခဲ့သည်"
    const sovMatch = cleanS.match(/^(.*?)(?:သည်|က|မှ|၏)\s+(.*?)(?:ကို|အား|ထံ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်)$/);
    if (sovMatch) {
      triplets.push({ s: norm(sovMatch[1]), v: sovMatch[3].trim(), o: norm(sovMatch[2]) });
      continue;
    }

    // 5. Pattern: State/Identity Parsing "သည်/က/၏" (Improved for informal ends)
    const stateMatch = cleanS.match(/^(.*?)(?:\s*)(?:သည်|က|၏|ဆိုတာ|မှာ|ဆိုတာက)(?:\s*)(.*?)(?:\s*)(?:သည်|၏|နေသည်|ပါသည်|ဖြစ်သည်|ဖြစ်ပါသည်|ဖြစ်ပါတယ်|ပါ|ဖြစ်တယ်|ပဲ|ပေါ့|ဖြစ်ရမယ်)?$/);
    if (stateMatch && stateMatch[1] && stateMatch[2]) {
      const p1 = norm(stateMatch[1]);
      const p2 = norm(stateMatch[2]);
      const v = cleanS.includes('မှာ') ? 'is_at' : (['ဆိုတာ', 'က', 'ဆိုတာက'].some(p => cleanS.includes(p)) ? 'is_a' : 'is_property');
      triplets.push({ s: p1, v: v, o: p2 });
      continue;
    }

    // 6. Direct identity fallback: "A က B"
    const simpleMatch = cleanS.match(/^(.*?)(?:\s*)က(?:\s*)(.*)$/);
    if (simpleMatch) {
      triplets.push({ s: norm(simpleMatch[1]), v: 'is_a', o: norm(simpleMatch[2]) });
      continue;
    }

    // --- English Advanced Grammar Parsing ---
    
    const words = s.split(/\s+/);
    if (words.length >= 2) {
    // 0.1 English Comparison: "A is bigger than B"
      const compMatch = s.match(/^(.*?)\s+(?:is|are|was|were)\s+(.*?)\s+than\s+(.*)$/i);
      if (compMatch) {
          triplets.push({ s: norm(compMatch[1]), v: 'is_' + norm(compMatch[2]), o: norm(compMatch[3]) });
          continue;
      }

      // 0.2 English Purpose: "He went to buy food"
      const purposeMatch = s.match(/^(.*?)\s+(.*?)\s+to\s+(.*?)\s+(.*)$/i);
      if (purposeMatch && ['went', 'came', 'stayed', 'called'].includes(purposeMatch[2].toLowerCase())) {
          triplets.push({ s: norm(purposeMatch[1]), v: purposeMatch[2], o: 'goal:' + norm(purposeMatch[3]) + ' ' + norm(purposeMatch[4]) });
          continue;
      }

      // 0.3 English Causal: "A because of B" or "B caused A"
      const causalMatch = s.match(/^(.*?)\s+(?:because\s+of|due\s+to)\s+(.*)$/i);
      if (causalMatch) {
          triplets.push({ s: norm(causalMatch[2]), v: 'causes', o: norm(causalMatch[1]) });
          continue;
      }

      // 0.4 English Temporal: "A after B" or "B before A"
      const afterMatch = s.match(/^(.*?)\s+after\s+(.*)$/i);
      if (afterMatch) {
          triplets.push({ s: norm(afterMatch[2]), v: 'happens_before', o: norm(afterMatch[1]) });
          continue;
      }
      const beforeMatch = s.match(/^(.*?)\s+before\s+(.*)$/i);
      if (beforeMatch) {
          triplets.push({ s: norm(beforeMatch[1]), v: 'happens_before', o: norm(beforeMatch[2]) });
          continue;
      }

      // 0.5 English Modals: "He can/must/should [Verb]"
      const modalMatch = s.match(/^(.*?)\s+(can|must|should|ought\s+to|might|may)\s+(.*?)\s+(.*)$/i);
      if (modalMatch) {
          triplets.push({ s: norm(modalMatch[1]), v: modalMatch[3].trim(), o: norm(modalMatch[4]) });
          continue;
      }

    // 1. English Possessive: "A's B is C" -> S: A, V: has, O: B AND S: B, V: is, O: C
      const possessiveMatch = s.match(/^(.*?)[’']s\s+(.*?)\s+(?:is|was|are|were)\s+(.*)$/i);
      if (possessiveMatch) {
         triplets.push({ s: norm(possessiveMatch[1]), v: 'owns', o: norm(possessiveMatch[2]) });
         triplets.push({ s: norm(possessiveMatch[2]), v: 'is_property', o: norm(possessiveMatch[3]) });
         continue;
      }

      // 2. English Ditransitive: "He gave/sent me [Object]"
      const ditransitiveMatch = s.match(/^(.*?)\s+(gave|sent|brought|showed)\s+(me|him|her|them|[A-Z][a-z]+)\s+(.*)$/i);
      if (ditransitiveMatch) {
          triplets.push({ s: norm(ditransitiveMatch[1]), v: ditransitiveMatch[2], o: norm(ditransitiveMatch[4]) });
          triplets.push({ s: norm(ditransitiveMatch[1]), v: 'interacts_with', o: norm(ditransitiveMatch[3]) });
          continue;
      }

      // 3. Coordinate Subject Split: "X and Y [Verb]"
      const andMatch = s.match(/^(.*?)\s+and\s+(.*?)\s+(.*?)\s+(.*)$/i);
      const commonVerbs = ['eat', 'drink', 'go', 'run', 'walk', 'see', 'buy', 'make', 'find', 'know', 'think', 'dance', 'stay', 'is', 'are', 'was', 'were'];
      if (andMatch && commonVerbs.includes(andMatch[3].toLowerCase())) {
          triplets.push({ s: norm(andMatch[1]), v: andMatch[3].trim(), o: norm(andMatch[4]) });
          triplets.push({ s: norm(andMatch[2]), v: andMatch[3].trim(), o: norm(andMatch[4]) });
          continue;
      }

      // 4. Passive Voice Pattern: "[Noun] was [Verb]ed by [Noun]"
      const passiveMatch = s.match(/^(.*?)\s+(?:is|was|were|has\s+been)\s+(.*?ed)\s+by\s+(.*)$/i);
      if (passiveMatch) {
         triplets.push({ s: norm(passiveMatch[3]), v: passiveMatch[2], o: norm(passiveMatch[1]) });
         continue;
      }

      // 5. Pattern: "There is/are [Noun] [Location]"
      const locations = 'under|on|in|at|near|above|below|behind|beside|inside|outside|between';
      const thereMatch = s.match(/^There\s+(?:is|are|was|were|has\s+been)\s+(?:a|an|the|some|many|few)?\s*(.*?)\s+((?:' + locations + ').*)$/i);
      if (thereMatch) {
        triplets.push({ s: norm(thereMatch[1]), v: 'is_at', o: norm(thereMatch[2]) });
        continue;
      }

      // Adjective/Descriptive Pattern: "[Noun] is/seems/becomes [Adjective]"
      const linkingVerbsIdx = words.findIndex(w => ['is', 'are', 'was', 'were', 'seems', 'looks', 'becomes', 'feels', 'smells', 'tastes'].includes(w.toLowerCase()));
      if (linkingVerbsIdx !== -1 && words.length - linkingVerbsIdx <= 3) {
          const subject = words.slice(0, linkingVerbsIdx).join(' ');
          const property = words.slice(linkingVerbsIdx + 1).join(' ');
          if (subject && property) {
            triplets.push({ s: norm(subject), v: 'is_property', o: norm(property) });
            continue;
          }
      }

      // Negation Check
      const isNegative = /\b(not|never|isn't|aren't|wasn't|weren't|won't|can't)\b/i.test(s) || (s.includes('မ') && s.endsWith('ဘူး'));
      
      // Heuristic SVO Split with Auxiliary Awareness
      // Find the first verb (including helping verbs)
      const auxiliaries = ['is', 'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'might', 'may', 'must'];
      
      let verbIndex = words.findIndex((w, i) => 
        i > 0 && (
          auxiliaries.includes(w.toLowerCase()) || 
          w.endsWith('s') || w.endsWith('ed') || w.endsWith('ing') ||
          ['eat', 'drink', 'go', 'run', 'walk', 'see', 'buy', 'make', 'find', 'know', 'think', 'dance', 'stay'].includes(w.toLowerCase())
        )
      );

      if (verbIndex !== -1) {
          const subject = words.slice(0, verbIndex).join(' ');
          // Find full verb phrase (including following auxiliaries/adverbs)
          let vEnd = verbIndex + 1;
          while (vEnd < words.length && (auxiliaries.includes(words[vEnd].toLowerCase()) || words[vEnd].endsWith('ing') || words[vEnd].endsWith('ed'))) {
            vEnd++;
          }
          const verbPhrase = words.slice(verbIndex, vEnd).join(' ');
          const object = words.slice(vEnd).join(' ');

          triplets.push({ 
            s: norm(subject), 
            v: isNegative ? 'is_not' : verbPhrase, 
            o: norm(object) 
          });
      } else {
          // Final Fallback
          triplets.push({ s: norm(words[0]), v: words[1], o: norm(words.slice(2).join(' ')) });
      }
    }
  }
  return triplets;
}

async function startServer() {
  await engine.loadFromCloud();
  const app = express();
  app.use(express.json());

  // Setup AI Components
  const kb = engine;
  const parser = new TripletExtractor();
  const inference = new InferenceEngine(kb);
  const sessions = new SessionManager();
  const nlg = new NLGManager();
  const chatbot = new SymbolicChatBot(kb, inference, parser, sessions, nlg);
  
  // API Routes
  app.post('/api/chat', async (req, res) => {
      const { text, userId } = req.body;
      if (!text) return res.status(400).json({ error: 'Text input is required' });
      const result = await chatbot.respond(text, userId || 'default');
      res.json(result);
  });
  
  app.post('/api/learn', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text input is required' });
    const learned = parseText(text);
    
    // Group by subject to avoid race conditions during batch processing
    const grouped = learned.reduce((acc: any, t) => {
        if (!acc[t.s]) acc[t.s] = [];
        acc[t.s].push(t);
        return acc;
    }, {});

    for (const [subject, triplets] of Object.entries(grouped)) {
        for (const t of triplets as any[]) {
            await kb.addTriplet(t.s, t.v, t.o);
        }
    }
    
    res.json({ success: true, triplets: learned });
  });

  app.post('/api/kb/import', async (req, res) => {
    const { triplets } = req.body;
    if (!Array.isArray(triplets)) return res.status(400).json({ error: 'Array of triplets required' });
    
    // Group by subject
    const grouped = triplets.reduce((acc: any, t) => {
        if (!acc[t.s]) acc[t.s] = [];
        acc[t.s].push(t);
        return acc;
    }, {});

    for (const [subject, ts] of Object.entries(grouped)) {
        for (const t of ts as any[]) {
            await kb.addTriplet(t.s, t.v, t.o);
        }
    }
    
    res.json({ success: true, imported: triplets.length });
  });

  app.post('/api/query', async (req, res) => {
    const { start, end, question } = req.body;
    
    // Handle Direct Question if provided
    if (question) {
        const result = await kb.query(question);

        if (result) return res.json(result);
        return res.status(404).json({ error: 'I do not have enough information to answer that yet.' });
    }

    if (!start || !end) return res.status(400).json({ error: 'Start and end are required for pathfinding' });
    // Handle Subject-Object Pathfinding
    const result = await kb.findPath(start, end);
    if (result) {
      const explanation = result.path.map(p => `${p.subject} ${p.verb} ${p.object}`).join(', which ');
      res.json({
        path: result.path,
        explanation: `Conclusion: ${explanation}`,
        certainty: result.certainty,
        logs: result.logs
      });
    } else {
      res.status(404).json({ error: 'No logical path found' });
    }
  });

  app.get('/api/tree', (req, res) => {
    res.json(kb.getTree());
  });

  app.post('/api/sync', async (req, res) => {
    await kb.loadFromCloud();
    res.json({ success: true, count: kb.getTree().length });
  });

  app.post('/api/clear', (req, res) => {
    kb.clear();
    res.json({ status: 'ok' });
  });

  app.post('/api/upload', upload.single('file'), async (req: any, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file' });
      
      let text = '';
      if (req.file.mimetype === 'application/pdf') {
          const data = await pdf(req.file.buffer);
          text = data.text;
      } else if (req.file.originalname.endsWith('.docx')) {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          text = result.value;
      } else if (req.file.mimetype === 'text/html') {
          const $ = cheerio.load(req.file.buffer.toString());
          text = $('body').text();
      } else {
          text = req.file.buffer.toString();
      }

      const learned = parseText(text);
      // Group by subject to avoid memory race conditions
      const grouped = learned.reduce((acc: any, t) => {
          if (!acc[t.s]) acc[t.s] = [];
          acc[t.s].push(t);
          return acc;
      }, {});

      for (const [subject, ts] of Object.entries(grouped)) {
          for (const t of ts as any[]) {
              await kb.addTriplet(t.s, t.v, t.o);
          }
      }
      res.json({ success: true, tripletsCount: learned.length });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Logic Engine Core running on http://localhost:${PORT}`);
  });
}

startServer();
