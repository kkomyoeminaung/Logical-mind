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

        is_myanmar = self.is_my_node(path[0][0])
        
        if is_myanmar:
            # Myanmar SOV logic: [Subject] သည် [Object] သို့ [Verb]
            sentence = f"{path[0][0]}"
            for i, (sub, verb, obj) in enumerate(path):
                v_text = "ဖြစ်သည်" if verb == "is_a" else verb.replace('_', ' ')
                if i == 0:
                    sentence += f" သည် {obj}"
                else:
                    sentence += f" မှတဆင့် {obj}"
                
                if i == len(path)-1:
                    sentence += f" သို့ {v_text}"
        else:
            # English SVO logic
            sentence = f"The {path[0][0]}"
            for sub, verb, obj in path:
                verb_text = "is a" if verb == "is_a" else verb.replace('_', ' ')
                sentence += f" {verb_text} {obj}"
                if (sub, verb, obj) != path[-1]:
                    sentence += ", which"
        
        confidence = f"({int(certainty * 100)}% certain)"
        return f"{sentence}. {confidence}"

    def is_my_node(self, text):
        import re
        return bool(re.search(r'[\u1000-\u109F]', str(text)))
