import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

// Initialize Firebase Admin (Using project default)
let app: admin.app.App;
if (!admin.apps.length) {
    app = admin.initializeApp({
        projectId: config.projectId
    });
} else {
    app = admin.apps[0]!;
}
const db = getFirestore(app, config.firestoreDatabaseId);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CATEGORIES = [
    "Myanmar History and Dynasties",
    "Theravada Buddhist Philosophy and Abhidhamma",
    "Formal Logic and Syllogisms",
    "Graph Theory and Symbolic AI",
    "General Science and Physics",
    "Ethics and Moral Philosophy",
    "Myanmar Language Grammar and Etymology",
    "World Geography and Cultures",
    "Modern Technology and Future of AI",
    "Social Etiquette and Wisdom"
];

async function generateBatch(category: string) {
    console.log(`Generating triplets for: ${category}`);
    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `Generate 50 distinct factual triplets about ${category}. 
        Format as JSON array of objects: { "s": "subject", "v": "verb", "o": "object", "f": "full_sentence_in_myanmar" }.
        Use lowercase keys. Ensure subjects and objects are normalized (single entities).
        Verbs should be specific like 'is_a', 'is_at', 'discovered', 'wrote', 'teaches'.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        s: { type: Type.STRING },
                        v: { type: Type.STRING },
                        o: { type: Type.STRING },
                        f: { type: Type.STRING }
                    },
                    required: ["s", "v", "o", "f"]
                }
            }
        }
    });

    try {
        const rawText = response.text.replace(/```json\n?|\n?```/g, '').trim();
        const triplets = JSON.parse(rawText);
        let count = 0;
        const batch = db.batch();
        
        for (const t of triplets) {
            const id = Buffer.from(`${t.s}-${t.v}-${t.o}`).toString('base64').substring(0, 50);
            const ref = db.collection('nodes').doc(id);
            batch.set(ref, {
                subject: t.s.toLowerCase().trim(),
                verb: t.v.toLowerCase().trim(),
                targetId: t.o.toLowerCase().trim(),
                fullSentence: t.f,
                weight: 1.0,
                source: 'curated_expansion',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            count++;
        }
        await batch.commit();
        console.log(`Successfully ingested ${count} triplets for ${category}.`);
        return count;
    } catch (e) {
        console.error("Failed to parse or save batch:", e);
        return 0;
    }
}

async function run() {
    console.log("Starting Mass Knowledge Ingestion Engine...");
    let total = 0;
    for (const cat of CATEGORIES) {
        total += await generateBatch(cat);
    }
    console.log(`Mass Ingestion Complete! Total Triplets Added: ${total}`);
    process.exit(0);
}

run();
