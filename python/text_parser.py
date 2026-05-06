import re

class TextParser:
    """
    Modular parser for extracting Subject-Verb-Object (SVO) triplets.
    Optimized for high-speed processing of billions of lines.
    """
    def __init__(self):
        # In a high-perf env, we'd use spacy.load("en_core_web_sm", disable=["ner", "textcat"])
        pass

    def extract_svo(self, text):
        """
        Extracts SVO triplets. 
        Supports English (SVO) and Myanmar (SOV/Particle-based) structure logic.
        """
        triplets = []
        # Multi-language sentence splitting
        sentences = re.split(r'[.!?၊။]+', text)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence: continue
            
            # 1. Advanced Myanmar Particle Parsing
            # Pattern A: S Obj V (with particles)
            sov_match = re.search(r'^(.*?)(?:က|သည်|ဟာ|ကတော့)\s+(.*?)(?:ကို|ကိုတော့|ကိုတော)\s+(.*?)(?:သည်|တယ်|ပါသည်|ပါတယ်|ခဲ့သည်)?$', sentence)
            if sov_match:
                s, o, v = sov_match.groups()
                triplets.append((self.normalize(s), self.normalize(v), self.normalize(o)))
                continue
            
            # Pattern B: S State (is happy)
            state_match = re.search(r'^([\w\s]+?)\s+(?:က|သည်|ဟာ)\s+([\w\s]+?)(?:ပါ|သည်|တယ်)?$', sentence)
            if state_match:
                s, state = state_match.groups()
                # Treat "is_state" as the implicit verb
                triplets.append((self.normalize(s), "is_state", self.normalize(state)))
                continue

            # 2. Heuristic Split
            words = sentence.split()
            if len(words) >= 3:
                if self.is_myanmar(words[-1]):
                    # SOV -> (Subj, Verb, Obj)
                    s = self.normalize(words[0])
                    v = self.normalize(words[-1])
                    o = self.normalize(" ".join(words[1:-1]))
                else:
                    # SVO
                    s = self.normalize(words[0])
                    v = self.normalize(words[1])
                    o = self.normalize(" ".join(words[2:]))
                
                triplets.append((s, v, o))
        
        return triplets

    def is_myanmar(self, text):
        # Quick Unicode check for Myanmar character range
        return bool(re.search(r'[\u1000-\u109F]', text))

    def normalize(self, token):
        """
        Lemmatizes tokens to preserve logic consistency in the tree.
        """
        return re.sub(r'[^\w\s-]', '', token.lower().strip())
