import sys
import json
from rocks_constructor import RocksConstructor
from inference_engine import InferenceEngine
from parser import TextParser
from nlg_manager import NLGManager

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command provided"}))
        sys.exit(1)

    cmd = sys.argv[1]
    
    if cmd == "learn":
        if len(sys.argv) < 3:
            print(json.dumps({"success": False, "error": "Usage: bridge.py learn <text>"}))
            sys.exit(1)
        text = sys.argv[2]
        db = RocksConstructor()
        parser = TextParser()
        triplets = parser.extract_svo(text)
        for s, v, o in triplets:
            db.add_triplet(s, v, o)
        db.flush()
        print(json.dumps({"success": True, "triplets": triplets}))
        db.close()
        
    elif cmd == "query":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: bridge.py query <start> <target>"}))
            sys.exit(1)
        start = sys.argv[2]
        target = sys.argv[3]
        db = RocksConstructor()
        engine = InferenceEngine(db)
        nlg = NLGManager()
        
        path, certainty = engine.recursive_path(start, target)
        if path:
            explanation = nlg.synthesize(path, certainty)
            print(json.dumps({
                "success": True, 
                "path": path, 
                "certainty": certainty,
                "explanation": explanation
            }))
        else:
            print(json.dumps({"success": False, "error": "No connection found"}))
        db.close()

if __name__ == "__main__":
    main()
