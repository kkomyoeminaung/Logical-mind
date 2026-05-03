import { LogicStore } from '../db/LogicStore';
import { Triplet, InferenceResult } from '../types';

export class InferenceEngine {
  constructor(private store: LogicStore) {}

  /**
   * Find a logical path between two nodes using Breadth-First Search (BFS).
   * Incorporates weights for confidence calculation.
   */
  public findConnection(startId: string, endId: string, maxDepth: number = 5): InferenceResult | null {
    const queue: { id: string; path: Triplet[]; confidence: number }[] = [
      { id: startId, path: [], confidence: 1.0 }
    ];
    const visited = new Map<string, number>(); // ID -> max confidence seen

    while (queue.length > 0) {
      const { id, path, confidence } = queue.shift()!;
      
      if (id === endId && path.length > 0) {
        return {
          path,
          confidence,
          explanation: `Found logical chain with ${Math.round(confidence * 100)}% reliability.`
        };
      }

      if (path.length >= maxDepth) continue;
      if (visited.has(id) && visited.get(id)! >= confidence) continue;
      visited.set(id, confidence);

      const relations = this.store.getResolvedRelations(id);
      
      for (const rel of relations) {
        // Calculate new confidence based on relation weight
        // Normalized weight: log weight addition or multiplication
        const relConfidence = Math.min(rel.weight / 5, 1); // Mock normalization
        const newConfidence = confidence * relConfidence;

        if (newConfidence < 0.1) continue; // Prune low confidence paths

        const newTriplet: Triplet = {
          subject: id,
          verb: rel.verb,
          object: rel.targetId,
          weight: rel.weight,
          timestamp: Date.now()
        };

        queue.push({
          id: rel.targetId,
          path: [...path, newTriplet],
          confidence: newConfidence
        });
      }

      // Sort queue by confidence for a "Best-First" Search behavior
      queue.sort((a, b) => b.confidence - a.confidence);
    }

    return null;
  }

  /**
   * Simple query for knowledge retrieval including inherited facts.
   */
  public queryKnowledge(entityId: string): Triplet[] {
    const relations = this.store.getResolvedRelations(entityId.toLowerCase());
    
    return relations.map(rel => ({
      subject: entityId,
      verb: rel.verb,
      object: rel.targetId,
      weight: rel.weight,
      timestamp: Date.now()
    }));
  }
}
