import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import * as admin from 'firebase-admin';
import fs from 'fs';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

const upload = multer({ storage: multer.memoryStorage() });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    db = admin.firestore(firebaseConfig.firestoreDatabaseId);
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
}

interface LogicNode {
  id: string;
  relations: Relation[];
  groups: string[];
  type: 'ENTITY' | 'STATE' | 'EVENT' | 'LOCATION';
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
    private maxDepth = 10;
    constructor(private kb: LogicEngine) {}
    
    // Recursive reasoning through parent hierarchy
    query(subject: string, predicate: string): any {
        return this.kb.findPath(subject, predicate, this.maxDepth); 
    }

    // Transitive reasoning: A -> B, B -> C => A -> C (Logical Pathfinding)
    transitiveReasoning(start: string, chain: string[]): any {
        let current = start;
        const totalPath: Triplet[] = [];
        let totalCertainty = 1.0;

        for (const relation of chain) {
            const found = this.kb.findPath(current, relation);
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
        fact: "ဟုတ်ကဲ့၊ ကျွန်တော် သိထားတာကတော့ - {subject} သည် {verb} {object} ဖြစ်ပါတယ်။",
        inheritance: "ဟုတ်ကဲ့၊ {subject} ဆိုသည်မှာ {object} ၏ အမျိုးအစားတစ်ခု ဖြစ်ပါတယ်။",
        greeting: ["မင်္ဂလာပါ! ကျွန်တော်က Logic AI ပါ။", "နေကောင်းလားဗျာ? ဘာတွေ သိချင်ပါသလဲ?", "Hello! I am ready to reason with you."],
        unknown: "ဆောရီး၊ ကျွန်တော် အဲဒီအချက်အလက်ကို မသိသေးပါဘူး။ သိအောင် သင်ပေးပါဦး။"
    };

    constructor(
        private kb: LogicEngine, 
        private inference: InferenceEngine, 
        private parser: TripletExtractor, 
        private sessions: SessionManager
    ) {}

    async respond(user_input: string, userId: string): Promise<{ response: string, context: string[], logic?: any, logs?: string[], consistency?: string, systemMessages?: string[] }> {
        const session = this.sessions.getOrCreateSession(userId);
        const cleanInput = user_input.trim().toLowerCase();
        const currentLogs: string[] = [];
        let consistency = 'Nominal';
        
        const initialSystemCount = session.history.filter(h => h.user === 'system').length;

        // 1. Greeting Check
        const greetings = ['hello', 'hi', 'မင်္ဂလာပါ', 'နေကောင်းလား'];
        if (greetings.some(g => cleanInput.includes(g))) {
            return { 
                response: this.templates.greeting[Math.floor(Math.random() * this.templates.greeting.length)],
                context: [],
                logs: ['Greeting intent detected.']
            };
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
            const knowledgeContext = this.kb.getRelevantContext(user_input);
            const systemMessages = session.history.filter(h => h.user === 'system').slice(initialSystemCount).map(h => h.ai);
            
            if (contradictions > 0) consistency = 'Conflict Resolved';

            return { 
                response: learnedCount > 0 
                    ? `ဟုတ်ကဲ့၊ အချက်အလက်သစ် ${learnedCount} ခုကို မှတ်သားလိုက်ပါပြီ။ ${contradictions > 0 ? 'အချို့သော ရှေ့နောက်မညီညွတ်မှုများကို ညှိနှိုင်းပေးထားပါတယ်။' : 'သိထားတဲ့ အချက်အလက်တွေနဲ့ ပေါင်းစပ်လိုက်ပါမယ်။'}`
                    : `မှတ်သားစရာ အချက်အလက်သစ် မတွေ့ရပါ သို့မဟုတ် ရှေ့နောက်မညီညွတ်မှုကြောင့် ပယ်ချခဲ့ပါတယ်။`,
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
        const knowledgeContext = this.kb.getRelevantContext(user_input);
        
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
                    response: symbolicResult.explanation, 
                    context: knowledgeContext,
                    consistency,
                    systemMessages,
                    logs: [`Symbolic Match: ${process.intent}`, ...(symbolicResult.logs || [])],
                    logic: symbolicResult.path ? {
                        path: symbolicResult.path,
                        explanation: symbolicResult.explanation,
                        certainty: symbolicResult.certainty || 1.0
                    } : (symbolicResult.relations ? {
                        path: symbolicResult.relations.map((r: any) => ({ subject: symbolicResult.subject, verb: r.verb, object: r.targetId })),
                        explanation: symbolicResult.explanation,
                        certainty: 0.95
                    } : undefined)
                };
            }
        }

        // 4. Default Fallback
        this.sessions.updateContext(userId, user_input, learnedTriplets.map(t => t.subject));
        return { 
            response: this.templates.unknown, 
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

  // Optimized On-Demand Fetcher for Scale
  private async ensureNode(id: string): Promise<LogicNode | null> {
    const key = id.toLowerCase();
    if (this.nodes.has(key)) return this.nodes.get(key)!;

    if (db) {
        try {
            const doc = await db.collection('nodes').doc(key).get();
            if (doc.exists) {
                const data = doc.data() as LogicNode;
                if (this.nodes.size >= this.cacheLimit) {
                    const firstKey = this.nodes.keys().next().value;
                    if (firstKey) this.nodes.delete(firstKey);
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
    ['ပျော်', 'ဝမ်းသာ'], ['ဝမ်းသာ', 'ပျော်']
  ]);
  private smallTalk: Record<string, string> = {
    'hello': 'Hello! I am a Symbolic Logic Engine. I don\'t just chat; I reason.',
    'hi': 'Hi! I am ready to process your logical statements.',
    'mingalaba': 'မင်္ဂလာပါ! ကျွန်တော်က အချက်အလက်တွေကို အခြေခံပြီး စဉ်းစားတွေးခေါ်ပေးတဲ့ Logic Engine ဖြစ်ပါတယ်။',
    'who are you': 'I am an Explainable Logic Engine. I use Graph Theory and Symbolic AI to derive conclusions with 100% audit trails.',
    'llm': 'LLMs are statistical models; I am a symbolic model. LLMs predict patterns; I verify facts. Together, we are the future of Neuro-Symbolic AI.',
    'better': 'I excel at precision and explainability. LLMs excel at creativity and scale. I am your logical debugger.',
    'creator': 'I was designed as a "World-Class" logic system for transparent decision making.'
  };

  // Initial load from Firestore - Refactored for Multi-Billion Scale
  async loadFromCloud() {
    if (!db) return;
    try {
      console.log('[LogicEngine] Initializing Logic Layer (Lazy Loading enabled)...');
      
      // We only load core bootstrap logic here, not the whole DB
      this.nodes.clear();
      
      // Default common knowledge
      this.addTriplet('human', 'is_property', 'mortal');
      this.addTriplet('socrates', 'is_a', 'human');
      this.addTriplet('mammal', 'is_a', 'animal');
      this.addTriplet('human', 'is_a', 'mammal');
      this.addTriplet('yangon', 'is_at', 'myanmar');
      this.addTriplet('myanmar', 'is_a', 'country');

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
      await db.collection('nodes').doc(key).set({
        ...node,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('[LogicEngine] Save failed:', err);
    }
  }

  async addTriplet(s: string, v: string, o: string, session?: Session) {
    if (!s || !v) return;
    
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
    
    // Logic: Inheritance Detection
    const isInheritance = ['is_a', 'ဖြစ်သည်', 'is a', 'ဆိုသည်မှာ', 'သည်'].includes(vId) && !vId.includes('မဟုတ်');
    if (isInheritance && oId !== 'null') {
        if (!sNode.groups.includes(oId)) {
            // Cycle Detect before adding
            const cycle = await this.findPath(oId, sId, 5);
            if (cycle) {
                if (session) session.history.push({ user: 'system', ai: `Warning: Circular inheritance detected (${sId} -> ${oId}). Blocked.` });
                return 'blocked';
            }
            sNode.groups.push(oId);
        }
    }
    
    const linkingVerbs = ['is', 'are', 'was', 'were', 'tastes', 'looks', 'feels', 'smells', 'becomes', 'ဖြစ်', 'နေ'];
    const locationPrepositions = ['at', 'in', 'on', 'under', 'near', 'beside', 'above', 'below', 'မှာ', 'အတွင်း'];
    
    const isState = linkingVerbs.some(lv => vId.includes(lv.toLowerCase())) || oId === 'null' || oId === '';
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

    const existing = sNode.relations.find(r => r.verb === finalVerb && r.targetId === finalObject);
    if (existing) {
      existing.weight = Math.min(100, existing.weight + 5); 
    } else {
      sNode.relations.push({ verb: finalVerb, targetId: finalObject, weight: isState ? 30 : 20 });
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
            oNode.relations.push({ verb: finalVerb, targetId: sId, weight: 15 });
            this.saveNode(oNode);
        }
    }

    // Persist to Cloud Async
    this.saveNode(sNode);
    if (oKey !== 'null') this.saveNode(this.nodes.get(oKey)!);
  }

  // Structured NLU Processor
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

      // Semantic Normalization: Strip common markers to get base entity
      const normalize = (s: string) => {
          if (!s) return '';
          // Avoid stripping if character length is very short to prevent collisions
          if (s.length <= 2) return s.trim();
          return s.replace(/(?:က|သည်|၏|ရဲ့|ကို|မှာ|အတွင်း|မှ|နှိုက်|ပါ|လား|လဲ)$/, '').trim();
      };

      // Small talk detection
      if (this.smallTalk[clean] || (clean.includes('hello') || clean.includes('မင်္ဂလာပါ'))) return { intent: 'SMALLTALK' };

      // 1. QUERY_ATTRIBUTE: "X ရဲ့ Y က ဘယ်သူလဲ/ဘာလဲ"
      const attrMatch = clean.match(/^(.*?)(?:ရဲ့|၏|က)\s+(.*?)\s+(?:က)?\s+(?:ဘယ်သူလဲ|ဘာလဲ|ဘယ်မှာလဲ|ဘယ်လိုလဲ|\?)/);
      if (attrMatch) {
          return { intent: 'QUERY_ATTRIBUTE', subject: normalize(attrMatch[1]), object: normalize(attrMatch[2]) };
      }

      // 2. QUERY_RELATION: "A က B လား", "A is B?"
      const isMatch = clean.match(/^(.*?)\s+(.*?)\s+(?:ဖြစ်သလား|လား|ပါသလား|\?)/);
      if (isMatch) {
          return { intent: 'QUERY_RELATION', subject: normalize(isMatch[1]), object: normalize(isMatch[2]) };
      }

      // 3. Definition Queries
      const defMatch = clean.match(/^(.*?)\s+(?:ဆိုတာ|ဆိုသည်မှာ)\s+(?:ဘာလဲ|ဘယ်သူလဲ|\?)/);
      if (defMatch) {
          return { intent: 'QUERY_ATTRIBUTE', subject: normalize(defMatch[1]), object: 'definition' };
      }

      // 4. Fallback for general questions or assertions
      if (clean.endsWith('?') || clean.endsWith('လဲ') || clean.endsWith('လား')) {
          const fallbackMatch = clean.match(/^(.*?)\s+(?:ဘာလဲ|ဘယ်သူလဲ|ဘယ်မှာလဲ|ဘယ်လိုလဲ)/);
          return { 
              intent: 'QUERY_ATTRIBUTE', 
              subject: normalize(fallbackMatch ? fallbackMatch[1] : clean),
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
                // Check for same property with different polarity
                if (r.verb === verb || r.verb.includes('property')) {
                    const rTarget = r.targetId.toLowerCase();
                    const rBase = rTarget.replace('not ', '').replace('မဟုတ်', '').trim();
                    const rIsNeg = rTarget.includes('not') || rTarget.includes('မဟုတ်');

                    if (rBase === baseTarget && rIsNeg !== isNeg) return true;
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

  // Refined Pathfinding with Inheritance and Recursive Reasoning (Asynchronous Lazy-Loading)
  async findPath(start: string, end: string, maxDepth = 6) {
    const sId = start.toLowerCase();
    const eId = end.toLowerCase();
    
    if (!(await this.ensureNode(sId))) return null;

    // Queue for BFS
    const queue: { node: string, path: any[], certainty: number, logs: string[] }[] = [
        { node: start, path: [], certainty: 1.0, logs: [`Reasoning started from [${start}]`] }
    ];
    const bestCertainty = new Map<string, number>();
    bestCertainty.set(sId, 1.0);

    let bestFound: { path: any[], certainty: number, logs: string[] } | null = null;

    while (queue.length > 0) {
      const { node, path, certainty, logs } = queue.shift()!;
      const nodeId = node.toLowerCase();

      // Successful path found
      if (nodeId === eId && path.length > 0) {
        if (!bestFound || certainty > bestFound.certainty) {
            bestFound = { path, certainty, logs };
        }
        continue; // Continue searching for better paths
      }
      
      if (path.length >= maxDepth) continue;
      
      const currentNode = await this.ensureNode(nodeId);
      if (!currentNode) continue;

      // 1. Direct Relations logic
      for (const rel of currentNode.relations) {
        const targetId = rel.targetId.toLowerCase();
        const stepConf = (rel.weight / 100) * 0.9; 
        const newCertainty = certainty * stepConf;

        if (!bestCertainty.has(targetId) || newCertainty > (bestCertainty.get(targetId) || 0)) {
            bestCertainty.set(targetId, newCertainty);
            queue.push({
              node: rel.targetId,
              path: [...path, { subject: node, verb: rel.verb, object: rel.targetId, weight: rel.weight }],
              certainty: newCertainty,
              logs: [...logs, `Step ${path.length + 1}: Since '${node}' ${rel.verb} '${rel.targetId}' (Conf: ${Math.round(stepConf*100)}%)`]
            });
        }
      }

      // 2. Inheritance Lookup (Recursively check parent classes/'is_a' relations)
      for (const group of currentNode.groups) {
        const pId = group.toLowerCase();
        const newCertainty = certainty * 0.99; 
        if (!bestCertainty.has(pId) || newCertainty > (bestCertainty.get(pId) || 0)) {
            bestCertainty.set(pId, newCertainty);
            queue.push({
              node: group,
              path: [...path, { subject: node, verb: 'is_a', object: group, weight: 100 }],
              certainty: newCertainty,
              logs: [...logs, `Inheritance: Since '${node}' is a type of '${group}', it inherits properties from '${group}'.`]
            });

          // Location Transitivity
          const pNode = await this.ensureNode(pId);
          if (pNode) {
              const locRel = pNode.relations.find(r => r.verb === 'is_at' || r.verb === 'မှာ ရှိသည်');
              if (locRel) {
                  const locId = locRel.targetId.toLowerCase();
                  if (!bestCertainty.has(locId)) {
                      queue.push({
                          node: locRel.targetId,
                          path: [...path, { subject: node, verb: 'is_a', object: group, weight: 100 }, { subject: group, verb: locRel.verb, object: locRel.targetId, weight: locRel.weight }],
                          certainty: certainty * 0.9,
                          logs: [...logs, `Location Transitivity: '${node}' is a '${group}', and '${group}' is at '${locRel.targetId}'.`]
                      });
                  }
              }
          }
        }
      }
    }

    return bestFound;
  }

    // Natural Language Response Generator
    private generateBurmeseResponse(result: any, question: string): string {
        if (!result) return "ဆောရီး၊ ကျွန်တော် အဲဒီအချက်အလက်ကို မသိသေးပါဘူး။ သိအောင် သင်ပေးပါဦး။";
        
        if (result.type === 'CONVERSATION') {
            return `[စနစ်] ${result.explanation}`;
        }
    
        // Direct Attribute Query results
        if (result.type === 'DESCRIPTION') {
            let resp = `${result.subject} နဲ့ပတ်သက်တဲ့ အချက်အလက်တွေကို စုစည်းတင်ပြပေးလိုက်�            return `ဟုတ်ကဲ့၊ ကျွန်တော့်ရဲ့ လော့ဂျစ်စနစ်အရ ${inference} ဖြစ်တာကြောင့် ${steps[steps.length-1]} လို့ ကောက်ချက်ချနိုင်ပါတယ်ခင်ဗျာ။`;
        }
    
        return "အချက်အလက်များကို ခွဲခြမ်းစိပ်ဖြာပြီးပါပြီ။";
    }

  // Natural Language Query Resolver
  async query(text: string, session?: Session) {
    const cleanText = text.trim();
    
    // 0. Structured Intent Processing
    const intentData = this.detectIntent(cleanText);
    const { intent, subject, object } = intentData;

    let result: any = null;

    if (intent === 'QUERY_ATTRIBUTE' && subject) {
         if (object) {
            // Case: "A ရဲ့ B က ဘာလဲ" -> find path from A to B
            result = await this.findPath(subject, object);
         } else {
            // Case: "A က ဘာလဲ" -> show all info about A
            const sId = subject.toLowerCase();
            const node = await this.ensureNode(sId) || (this.synonyms.has(sId) ? await this.ensureNode(this.synonyms.get(sId)!) : null);
            
            // Inverse lookup: Limited to current cache for performance in large DBs
            const members: string[] = [];
            for (const n of this.nodes.values()) {
                if (n.groups.some(g => g.toLowerCase() === sId)) {
                    members.push(n.id);
                }
            }

            if (node || members.length > 0) {
               result = { 
                    type: 'DESCRIPTION', 
                    subject: node ? node.id : subject, 
                    relations: node ? node.relations : [], 
                    groups: node ? node.groups : [],
                    members: members
               };
            }
         }
    } else if (intent === 'QUERY_RELATION' && subject && object) {
        // Case: "A သည် B လား" -> find path
        result = await this.findPath(subject, object);
    } 
    
    // Fallback if no structured result
    if (!result) {
        const engWhatMatch = cleanText.match(/^(?:what|who)\s+(?:is|are)\s+(.*)$/i);
        if (engWhatMatch) {
            const sId = engWhatMatch[1].trim().toLowerCase();
            const node = await this.ensureNode(sId);
            if (node) {
                 result = { type: 'DESCRIPTION', subject: node.id, relations: node.relations };
            }
        }
    }

    if (result) {
        return {
            ...result,
            explanation: this.generateBurmeseResponse(result, text)
        };
    }

    return null;
  }

  getTree() {
    return Array.from(this.nodes.values()).slice(0, 100);
  }

  // Symbol Retrieval for RAG with Efficiency Optimization
  async getRelevantContext(text: string): Promise<string[]> {
      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const facts: string[] = [];
      const visited = new Set<string>();
      
      const uniqueWords = Array.from(new Set(words)).slice(0, 10);

      const tasks = uniqueWords.map(async (word) => {
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
          this.nodes.clear();
      }

      return Array.from(new Set(facts)).slice(0, 20);
  }

  clear() {
    this.nodes.clear();
  }
}u'd use a Firestore Collection Query here)
            const members: string[] = [];
            for (const n of this.nodes.values()) {
                if (n.groups.some(g => g.toLowerCase() === sId)) {
                    members.push(n.id);
                }
            }

            if (node || members.length > 0) {
               result = { 
                    type: 'DESCRIPTION', 
                    subject: node ? node.id : subject, 
                    relations: node ? node.relations : [], 
                    groups: node ? node.groups : [],
                    members: members
               };
            }
         }
    } else if (intent === 'QUERY_RELATION' && subject && object) {
        // Case: "A သည် B လား" -> find path
        result = await this.findPath(subject, object);
    } 
    
    // Fallback if no structured result
    if (!result) {
        const engWhatMatch = cleanText.match(/^(?:what|who)\s+(?:is|are)\s+(.*)$/i);
        if (engWhatMatch) {
            const sId = engWhatMatch[1].trim().toLowerCase();
            const node = await this.ensureNode(sId);
            if (node) {
                 result = { type: 'DESCRIPTION', subject: node.id, relations: node.relations };
            }
        }
    }

    if (result) {
        return {
            ...result,
            explanation: this.generateBurmeseResponse(result, text)
        };
    }

    return null;
  }

  getTree() {
    return Array.from(this.nodes.values()).slice(0, 100);
  }

  // Symbol Retrieval for RAG with Efficiency Optimization
  async getRelevantContext(text: string): Promise<string[]> {
      const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
      const facts: string[] = [];
      const visited = new Set<string>();

      for (const word of words) {
          const cleanWord = word.replace(/[.!?၊။,]/g, '');
          const canonicalName = this.synonyms.get(cleanWord) || cleanWord;
          const node = await this.ensureNode(canonicalName);
          
          if (node && !visited.has(node.id.toLowerCase())) {
              visited.add(node.id.toLowerCase());
              const sortedRels = [...node.relations].sort((a, b) => b.weight - a.weight).slice(0, 5);
              sortedRels.forEach(rel => {
                  facts.push(`${node.id}, ${rel.verb}, ${rel.targetId}`);
              });
              node.groups.slice(0, 3).forEach(async group => {
                  facts.push(`${node.id}, is_a, ${group}`);
                  const parent = await this.ensureNode(group.toLowerCase());
                  if (parent) {
                      parent.relations.slice(0, 3).forEach(pR => facts.push(`${group}, ${pR.verb}, ${pR.targetId}`));
                  }
              });
          }
      }
      return Array.from(new Set(facts)).slice(0, 15);
  }

  clear() {
    this.nodes.clear();
  }
}

const engine = new LogicEngine();

// Advanced Multilingual Parser
function parseText(text: string): {s: string, v: string, o: string}[] {
  const triplets: {s: string, v: string, o: string}[] = [];
  
  // Handing long sentences: Split by common conjunctions
  const splitters = /\s+(?:and|but|while|then|although|because|ပြီးတော့|လျှင်|သော်လည်း|ဖြစ်စေ|ဖြစ်ပါက)\s+/i;
  const segments = text.split(splitters);
  const sentences = segments.flatMap(seg => seg.split(/[.!?၊။\n\r]+/));

  for (let sRaw of sentences) {
    const s = sRaw.trim();
    if (!s || s.length < 2) continue;

    // --- Myanmar Advanced Grammar Parsing ---
    
    // 1. Clean Honorifics & Ending particles
    const cleanS = s.replace(/[ပါတော်မူ၏လဲဗျာရှင်နော်ဦးအုံးဟယ်]+$/g, '').trim();

    // 1. Myanmar Possessive: "မောင်မောင်၏ စာအုပ်သည် နီသည်"
    const myanPossessiveMatch = cleanS.match(/^(.*?)(?:၏|ရဲ့)\s+(.*?)(?:သည်|က)\s+(.*?)(?:သည်|၏|နေသည်|ပါသည်)$/);
    if (myanPossessiveMatch) {
        triplets.push({ s: myanPossessiveMatch[1].trim(), v: 'owns', o: myanPossessiveMatch[2].trim() });
        triplets.push({ s: myanPossessiveMatch[2].trim(), v: 'is_property', o: myanPossessiveMatch[3].trim() });
        continue;
    }

    // 2. Myanmar Relative Clause: "လှသော ပန်းသည် နီသည်" (Beautiful flower is red)
    const relativeMatch = cleanS.match(/^(.*?)(?:သော|သည့်|သည့်)\s+(.*?)(?:သည်|က)\s+(.*?)(?:သည်|၏|နေသည်|ပါသည်)$/);
    if (relativeMatch) {
        triplets.push({ s: relativeMatch[2].trim(), v: 'is_property', o: relativeMatch[1].trim() });
        triplets.push({ s: relativeMatch[2].trim(), v: 'is_property', o: relativeMatch[3].trim() });
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
        triplets.push({ s: 'Entity', v: myanGoalMatch[2].trim(), o: 'goal:' + myanGoalMatch[1].trim() });
        continue;
    }

    // 2.3 Myanmar Temporal: "မိုးရွာပြီးနောက် နေထွက်သည်" (Sun comes out after it rains)
    const myanTempMatch = cleanS.match(/^(.*?)(?:ပြီးနောက်|ပြီးလျှင်|ပြီးမှ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်)$/);
    if (myanTempMatch) {
        triplets.push({ s: myanTempMatch[1].trim(), v: 'happens_before', o: myanTempMatch[2].trim() });
        continue;
    }

    // 2.4 Myanmar Causal: "နေပူသောကြောင့် ရေငတ်သည်" (Thirsty because it's hot)
    const myanCausalMatch = cleanS.match(/^(.*?)(?:သောကြောင့်|ခြင်းကြောင့်|တာကြောင့်)\s+(.*?)(?:သည်|၏|ပါသည်|ခဲ့သည်)$/);
    if (myanCausalMatch) {
        triplets.push({ s: myanCausalMatch[1].trim(), v: 'causes', o: myanCausalMatch[2].trim() });
        continue;
    }

    // 2.5 Myanmar Conditional: "မိုးရွာလျှင် ထီးယူပါ" (If it rains, take umbrella)
    const myanCondMatch = cleanS.match(/^(.*?)(?:လျှင်|လျှင်သော်|ပါက)\s+(.*?)(?:ပါ|သည်|၏)$/);
    if (myanCondMatch) {
        triplets.push({ s: myanCondMatch[1].trim(), v: 'leads_to', o: myanCondMatch[2].trim() });
        continue;
    }

    // 3. Pattern: Multi-Subject (မောင်မောင်နှင့် မမ)
    const multiSubjectMatch = cleanS.match(/^(.*?)(?:နှင့်|နှင့်|‌ေရာ)\s+(.*?)(?:သည်|က|မှ|၏)\s+(.*?)(?:ကို|အား|ထံ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်)$/);
    if (multiSubjectMatch) {
      const subjects = [multiSubjectMatch[1], multiSubjectMatch[2]];
      for (let sub of subjects) {
        triplets.push({ s: sub.trim(), v: multiSubjectMatch[4].trim(), o: multiSubjectMatch[3].trim() });
      }
      continue;
    }
    
    // 3. Pattern: Location/Origin "မှ/မှာ/ထံသို့/ဆီသို့"
    const locMatch = cleanS.match(/^(.*?)\s+(.*?)(?:မှာ|မှ|ထံ|ဆီ)(?:သို့|က)?\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်|ပါသနည်း)$/);
    if (locMatch) {
      triplets.push({ s: locMatch[1].trim(), v: 'is_at', o: locMatch[2].trim() });
      triplets.push({ s: locMatch[1].trim(), v: locMatch[3].trim(), o: locMatch[2].trim() });
      continue;
    }

    // 4. Pattern: Particle-based SOV "သည်/က" ... "ကို/အား" ... "သည်/၏/ခဲ့သည်"
    const sovMatch = cleanS.match(/^(.*?)(?:သည်|က|မှ|၏)\s+(.*?)(?:ကို|အား|ထံ)\s+(.*?)(?:သည်|၏|ခဲ့သည်|နေသည်|ပါသည်)$/);
    if (sovMatch) {
      triplets.push({ s: sovMatch[1].trim(), v: sovMatch[3].trim(), o: sovMatch[2].trim() });
      continue;
    }

    // 5. Pattern: State Parsing "သည်/က/၏"
    const stateMatch = cleanS.match(/^(.*?)(?:သည်|က|၏)\s+(.*?)(?:သည်|၏|နေသည်|ပါသည်)$/);
    if (stateMatch) {
      triplets.push({ s: stateMatch[1].trim(), v: 'is_a', o: stateMatch[2].trim() });
      continue;
    }

    // --- English Advanced Grammar Parsing ---
    
    const words = s.split(/\s+/);
    if (words.length >= 2) {
    // 0.1 English Comparison: "A is bigger than B"
      const compMatch = s.match(/^(.*?)\s+(?:is|are|was|were)\s+(.*?)\s+than\s+(.*)$/i);
      if (compMatch) {
          triplets.push({ s: compMatch[1].trim(), v: 'is_' + compMatch[2].trim(), o: compMatch[3].trim() });
          continue;
      }

      // 0.2 English Purpose: "He went to buy food"
      const purposeMatch = s.match(/^(.*?)\s+(.*?)\s+to\s+(.*?)\s+(.*)$/i);
      if (purposeMatch && ['went', 'came', 'stayed', 'called'].includes(purposeMatch[2].toLowerCase())) {
          triplets.push({ s: purposeMatch[1].trim(), v: purposeMatch[2], o: 'goal:' + purposeMatch[3] + ' ' + purposeMatch[4] });
          continue;
      }

      // 0.3 English Causal: "A because of B" or "B caused A"
      const causalMatch = s.match(/^(.*?)\s+(?:because\s+of|due\s+to)\s+(.*)$/i);
      if (causalMatch) {
          triplets.push({ s: causalMatch[2].trim(), v: 'causes', o: causalMatch[1].trim() });
          continue;
      }

      // 0.4 English Temporal: "A after B" or "B before A"
      const afterMatch = s.match(/^(.*?)\s+after\s+(.*)$/i);
      if (afterMatch) {
          triplets.push({ s: afterMatch[2].trim(), v: 'happens_before', o: afterMatch[1].trim() });
          continue;
      }
      const beforeMatch = s.match(/^(.*?)\s+before\s+(.*)$/i);
      if (beforeMatch) {
          triplets.push({ s: beforeMatch[1].trim(), v: 'happens_before', o: beforeMatch[2].trim() });
          continue;
      }

      // 0.5 English Modals: "He can/must/should [Verb]"
      const modalMatch = s.match(/^(.*?)\s+(can|must|should|ought\s+to|might|may)\s+(.*?)\s+(.*)$/i);
      if (modalMatch) {
          const confidence = modalMatch[2].toLowerCase() === 'must' ? 90 : (modalMatch[2].toLowerCase() === 'might' ? 30 : 60);
          triplets.push({ s: modalMatch[1].trim(), v: modalMatch[3].trim(), o: modalMatch[4].trim() });
          // Note: We could store modality as a separate field, but for now we influence weights if we had that logic
          continue;
      }

    // 1. English Possessive: "A's B is C" -> S: A, V: has, O: B AND S: B, V: is, O: C
      const possessiveMatch = s.match(/^(.*?)[’']s\s+(.*?)\s+(?:is|was|are|were)\s+(.*)$/i);
      if (possessiveMatch) {
         triplets.push({ s: possessiveMatch[1].trim(), v: 'owns', o: possessiveMatch[2].trim() });
         triplets.push({ s: possessiveMatch[2].trim(), v: 'is_property', o: possessiveMatch[3].trim() });
         continue;
      }

      // 2. English Ditransitive: "He gave/sent me [Object]"
      const ditransitiveMatch = s.match(/^(.*?)\s+(gave|sent|brought|showed)\s+(me|him|her|them|[A-Z][a-z]+)\s+(.*)$/i);
      if (ditransitiveMatch) {
          triplets.push({ s: ditransitiveMatch[1].trim(), v: ditransitiveMatch[2], o: ditransitiveMatch[4].trim() });
          triplets.push({ s: ditransitiveMatch[1].trim(), v: 'interacts_with', o: ditransitiveMatch[3].trim() });
          continue;
      }

      // 3. Coordinate Subject Split: "X and Y [Verb]"
      const andMatch = s.match(/^(.*?)\s+and\s+(.*?)\s+(.*?)\s+(.*)$/i);
      const commonVerbs = ['eat', 'drink', 'go', 'run', 'walk', 'see', 'buy', 'make', 'find', 'know', 'think', 'dance', 'stay', 'is', 'are', 'was', 'were'];
      if (andMatch && commonVerbs.includes(andMatch[3].toLowerCase())) {
          triplets.push({ s: andMatch[1].trim(), v: andMatch[3].trim(), o: andMatch[4].trim() });
          triplets.push({ s: andMatch[2].trim(), v: andMatch[3].trim(), o: andMatch[4].trim() });
          continue;
      }

      // 1. Passive Voice Pattern: "[Noun] was [Verb]ed by [Noun]"
      const passiveMatch = s.match(/^(.*?)\s+(?:is|was|were|has\s+been)\s+(.*?ed)\s+by\s+(.*)$/i);
      if (passiveMatch) {
         triplets.push({ s: passiveMatch[3], v: passiveMatch[2], o: passiveMatch[1] });
         continue;
      }

      // 2. Pattern: "There is/are [Noun] [Location]"
      const locations = 'under|on|in|at|near|above|below|behind|beside|inside|outside|between';
      const thereMatch = s.match(/^There\s+(?:is|are|was|were|has\s+been)\s+(?:a|an|the|some|many|few)?\s*(.*?)\s+((?:' + locations + ').*)$/i);
      if (thereMatch) {
        triplets.push({ s: thereMatch[1], v: 'is_at', o: thereMatch[2] });
        continue;
      }

      // Adjective/Descriptive Pattern: "[Noun] is/seems/becomes [Adjective]"
      const linkingVerbsIdx = words.findIndex(w => ['is', 'are', 'was', 'were', 'seems', 'looks', 'becomes', 'feels', 'smells', 'tastes'].includes(w.toLowerCase()));
      if (linkingVerbsIdx !== -1 && words.length - linkingVerbsIdx <= 3) {
          const subject = words.slice(0, linkingVerbsIdx).join(' ');
          const property = words.slice(linkingVerbsIdx + 1).join(' ');
          if (subject && property) {
            triplets.push({ s: subject, v: 'is_property', o: property });
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
            s: subject, 
            v: isNegative ? 'is_not' : verbPhrase, 
            o: object || '' 
          });
      } else {
          // Final Fallback
          triplets.push({ s: words[0], v: words[1], o: words.slice(2).join(' ') });
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
  const chatbot = new SymbolicChatBot(kb, inference, parser, sessions);
  
  // API Routes
  app.post('/api/chat', async (req, res) => {
      const { text, userId } = req.body;
      const result = await chatbot.respond(text, userId || 'default');
      res.json(result);
  });
  
  app.post('/api/learn', async (req, res) => {
    const { text } = req.body;
    const learned = parseText(text);
    for (const t of learned) {
        await kb.addTriplet(t.s, t.v, t.o);
    }
    res.json({ success: true, triplets: learned });
  });

  app.post('/api/kb/import', async (req, res) => {
    const { triplets } = req.body;
    if (!Array.isArray(triplets)) return res.status(400).json({ error: 'Array of triplets required' });
    
    let count = 0;
    for (const t of triplets) {
        await kb.addTriplet(t.s, t.v, t.o);
        count++;
    }
    res.json({ success: true, imported: count });
  });

  app.post('/api/query', async (req, res) => {
    const { start, end, question } = req.body;
    
    // Handle Direct Question if provided
    if (question) {
        const result = await kb.query(question);
        
        // Auto-Learn: extract facts from query and response
        if (result && result.explanation) {
            const newFacts = parseText(result.explanation);
            for (const t of newFacts) {
                await kb.addTriplet(t.s, t.v, t.o);
            }
        }

        if (result) return res.json(result);
        return res.status(404).json({ error: 'I do not have enough information to answer that yet.' });
    }

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
      for (const t of learned) {
          await kb.addTriplet(t.s, t.v, t.o);
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
