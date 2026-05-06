import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

async function seed() {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
        console.error('No firebase-applet-config.json found.');
        return;
    }

    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let app;
    if (!admin.apps.length) {
        app = admin.initializeApp({
            projectId: firebaseConfig.projectId,
        });
    } else {
        app = admin.apps[0];
    }

    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    const nodes = [
        { id: 'Socrates', type: 'ENTITY', groups: ['Human'], relations: [] },
        { id: 'Human', type: 'ENTITY', groups: ['Mortal'], relations: [] },
        { id: 'Mortal', type: 'STATE', groups: [], relations: [] },
        { id: 'Aristotle', type: 'ENTITY', groups: ['Human'], relations: [] },
        { id: 'Earth', type: 'ENTITY', groups: ['Planet'], relations: [] },
        { id: 'Planet', type: 'ENTITY', groups: [], relations: [{ verb: 'is_in', targetId: 'Space', weight: 100 }] },
        { id: 'Space', type: 'LOCATION', groups: [], relations: [] },
        { id: 'Sun', type: 'ENTITY', groups: ['Star'], relations: [] },
        { id: 'Star', type: 'ENTITY', groups: [], relations: [{ verb: 'provides', targetId: 'Light', weight: 100 }] },
        { id: 'Light', type: 'ENTITY', groups: [], relations: [] },
        { id: 'Myanmar', type: 'LOCATION', groups: ['Country'], relations: [] },
        { id: 'Country', type: 'ENTITY', groups: [], relations: [] },
        { id: 'Yangon', type: 'LOCATION', groups: ['City'], relations: [{ verb: 'is_in', targetId: 'Myanmar', weight: 100 }] },
        { id: 'City', type: 'ENTITY', groups: [], relations: [] },
        { id: 'Mandalay', type: 'LOCATION', groups: ['City'], relations: [{ verb: 'is_in', targetId: 'Myanmar', weight: 100 }] }
    ];

    console.log('Seeding initial knowledge nodes...');
    const batch = db.batch();
    for (const node of nodes) {
        const key = node.id.toLowerCase();
        const docId = key.replace(/[\s\/\\.#\[\]\*\?!]+/g, '_').replace(/^_+|_+$/g, '') || key;
        const docRef = db.collection('nodes').doc(docId);
        batch.set(docRef, {
            ...node,
            id: node.id, // Keep the readable ID for display
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    await batch.commit();
    console.log('Seeding complete.');
    process.exit(0);
}

seed();
