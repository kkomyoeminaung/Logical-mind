import { Triplet } from '../types';

export class NLGManager {
  /**
   * Translates a list of logical triplets into a human-readable string.
   */
  public explainPath(path: Triplet[]): string {
    if (path.length === 0) return "No logical connection found.";

    const steps = path.map(t => {
      const verb = t.verb.replace('_passive', ' is acted upon by');
      return `${t.subject} ${verb} ${t.object}`;
    });

    return steps.join(', which leads to ') + '.';
  }

  public formatFact(triplet: Triplet): string {
    return `The engine knows that ${triplet.subject} ${triplet.verb} ${triplet.object}.`;
  }
}
