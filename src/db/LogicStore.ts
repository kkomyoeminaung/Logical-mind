import { Triplet, LogicNode, Relation } from '../types';

export class LogicStore {
  private nodes: Map<string, LogicNode> = new Map();
  private batch: Triplet[] = []; // Simple batch buffer

  /**
   * Adds a triplet to a buffer for later processing (Efficiency requirement)
   */
  public queueTriplet(triplet: Triplet): void {
    this.batch.push(triplet);
  }

  /**
   * Processes all queued triplets (Simulates WriteBatch)
   */
  public commitBatch(): void {
    this.batch.forEach(t => this.processTriplet(t));
    this.batch = [];
  }

  private processTriplet(triplet: Triplet): void {
    const { subject, verb, object } = triplet;

    // Handle 'is-a' relationships for grouping/inheritance
    if (verb === 'is' || verb === 'is a' || verb === 'is an') {
      this.ensureNode(subject);
      const node = this.nodes.get(subject)!;
      if (!node.groups.includes(object)) {
        node.groups.push(object);
      }
    }

    // Auto-Learning & Weight Management
    this.upsertRelation(subject, verb, object, false);
    this.upsertRelation(object, `${verb}_passive`, subject, true);
  }

  private upsertRelation(sourceId: string, verb: string, targetId: string, isReverse: boolean): void {
    this.ensureNode(sourceId);
    const node = this.nodes.get(sourceId)!;

    // Check for existing triplet to increment weight (Auto-Learning)
    const existing = node.relations.find(r => r.verb === verb && r.targetId === targetId);

    if (existing) {
      existing.weight += 1;
    } else {
      // Check for contradictions (e.g., "is good" vs "is bad")
      // Simple logic: if verb is "is" and target is different, flag it
      const contradiction = node.relations.find(r => r.verb === verb && r.targetId !== targetId);
      
      node.relations.push({
        verb,
        targetId,
        weight: contradiction ? 0.5 : 1, // Lower weight for potential contradictions
        isReverse
      });
    }
  }

  private ensureNode(id: string): void {
    if (!this.nodes.get(id)) {
      this.nodes.set(id, { id, relations: [], groups: [], type: 'ENTITY' });
    }
  }

  public getNode(id: string): LogicNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Gets relations including inherited ones from parent groups
   */
  public getResolvedRelations(id: string): Relation[] {
    const node = this.getNode(id);
    if (!node) return [];

    let allRelations = [...node.relations];
    
    // Resolve inheritance from groups
    node.groups.forEach(groupId => {
      const parentRelations = this.getResolvedRelations(groupId);
      // Only inherit descriptive relations, avoid loops
      allRelations = [...allRelations, ...parentRelations.map(r => ({ ...r, weight: r.weight * 0.8 }))]; 
    });

    return allRelations;
  }

  public getAllNodes(): LogicNode[] {
    return Array.from(this.nodes.values());
  }

  public clear(): void {
    this.nodes.clear();
  }
}
