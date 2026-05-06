# NLGManager: For human-readable output.

class NLGManager:
    """
    Translates raw SVO logic paths back into natural language sentences.
    """
    def __init__(self):
        pass

    def synthesize(self, path, certainty):
        """
        Takes a list of triplets and constructs a human-readable sentence.
        Supports English (SVO) and Myanmar (SOV) phrasing.
        """
        if not path:
            return "No logical connection found."

        sentences = []
        for sub, verb, obj in path:
            if self.is_my_node(sub) or self.is_my_node(obj):
                v_text = "ဖြစ်သည်" if verb == "is_a" else verb.replace('_', ' ')
                sentences.append(f"{sub} သည် {obj} {v_text}")
            else:
                verb_text = "is a" if verb == "is_a" else verb.replace('_', ' ')
                sentences.append(f"{sub} {verb_text} {obj}")
        
        sentence = " → ".join(sentences)
        
        confidence = f"({int(certainty * 100)}% certain)"
        return f"{sentence}. {confidence}"

    def is_my_node(self, text):
        import re
        return bool(re.search(r'[\u1000-\u109F]', str(text)))
