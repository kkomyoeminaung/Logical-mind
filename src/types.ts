export interface Triplet {
  subject: string;
  verb: string;
  object: string;
  weight: number;
  timestamp: number;
  metadata?: {
    isContradiction?: boolean;
    group?: string;
  };
}

export interface Relation {
  verb: string;
  targetId: string;
  weight: number;
  isReverse: boolean;
}

export interface LogicNode {
  id: string;
  relations: Relation[];
  groups: string[]; // For 'Is-a' inheritance
  type: 'ENTITY' | 'STATE' | 'EVENT' | 'LOCATION';
}

export interface InferenceResult {
  path: Triplet[];
  explanation: string;
  confidence: number;
}
