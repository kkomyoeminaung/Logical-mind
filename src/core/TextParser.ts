import nlp from 'compromise';
import { Triplet } from '../types';

export class TextParser {
  /**
   * Extracts SVO triplets from a raw text.
   * Leverages compromise to identify nouns and verbs with better precision.
   */
  public parse(text: string): Triplet[] {
    const doc = nlp(text);
    const results: Triplet[] = [];

    // Split text into sentences for independent analysis
    const sentences = doc.sentences().json();

    sentences.forEach((s: any) => {
      const terms = s.terms;
      
      // We look for Subject (Noun) -> Verb -> Object (Noun)
      // This is a naive implementation; real systems use dependency parsing (like spaCy)
      let subject = '';
      let verb = '';
      let object = '';

      for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const tags = term.tags;

        // Greedy Subject matching
        if (!subject && (tags.includes('Noun') || tags.includes('Pronoun') || tags.includes('Person'))) {
          subject = term.clean;
        } 
        // Verb matching (after subject)
        else if (subject && !verb && tags.includes('Verb')) {
          verb = term.clean;
          // Handle multi-word verbs like "is a" or "has been"
          const nextTerm = terms[i+1];
          if (nextTerm && nextTerm.tags.includes('Determiner')) {
             verb += ' ' + nextTerm.clean;
          }
        } 
        // Object matching (after verb)
        else if (subject && verb && !object && (tags.includes('Noun') || tags.includes('Adjective'))) {
          object = term.clean;
        }
      }

      if (subject && verb && object) {
        results.push({
          subject: this.cleanse(subject),
          verb: this.cleanse(verb),
          object: this.cleanse(object),
          weight: 1, // Default weight for a single mention
          timestamp: Date.now()
        });
      }
    });

    return results;
  }

  private cleanse(text: string): string {
    return text.toLowerCase().trim().replace(/[^\w\s-]/gi, '');
  }
}
