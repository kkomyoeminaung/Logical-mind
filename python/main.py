# Main entry point optimized for massive datasets
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from parser import TextParser
from rocks_constructor import RocksConstructor
from inference_engine import InferenceEngine
from nlg_manager import NLGManager

class LogicSystem:
    def __init__(self):
        self.parser = TextParser()
        self.db = RocksConstructor()
        self.engine = InferenceEngine(self.db)
        self.nlg = NLGManager()

    def process_chunk(self, chunk):
        """
        Standalone function for child processes to parse text.
        """
        parser = TextParser()
        return parser.extract_svo(chunk)

    def learn_from_large_file(self, filename, chunk_size=100000):
        """
        Reads a massive file in chunks and processes them in parallel.
        Designed for high-performance ingestion.
        """
        print(f"Starting ingestion from {filename}...")
        
        with open(filename, 'r') as f:
            while True:
                lines = [f.readline() for _ in range(chunk_size)]
                lines = [l for l in lines if l] # Filter EOF
                if not lines:
                    break
                
                # Split lines into chunks for parallel parsing
                # Using multiprocessing to utilize all CPU cores
                num_cores = multiprocessing.cpu_count()
                chunk_len = len(lines) // num_cores
                if chunk_len == 0: chunk_len = 1
                
                sub_chunks = [lines[i:i + chunk_len] for i in range(0, len(lines), chunk_len)]
                
                with ProcessPoolExecutor(max_workers=num_cores) as executor:
                    results = list(executor.map(self.process_chunk, [" ".join(sc) for sc in sub_chunks]))
                
                # Sequential write to RocksDB (I/O bound)
                for triplets in results:
                    for s, v, o in triplets:
                        self.db.add_triplet(s, v, o)
                
                print(f"Processed chunk of {len(lines)} lines.")
        
        self.db.flush()
        print("Massive knowledge injection complete.")

    def start_repl(self):
        """
        Interactive shell for real-time querying.
        """
        print("\n--- Real-time Logic Query Shell ---")
        print("Enter entities to find logical connections.")
        print("Type 'exit' to quit.")
        
        try:
            while True:
                start = input("\nFrom entity (e.g. cat): ").strip()
                if not start: continue
                if start.lower() == 'exit': break
                
                target = input("To entity (e.g. water): ").strip()
                if not target: continue
                
                print(f"Searching for connection between '{start}' and '{target}'...")
                self.run_query(start, target)
        except KeyboardInterrupt:
            print("\nExiting shell.")

    def run_query(self, start, end):
        path, certainty = self.engine.recursive_path(start, end)
        if path:
            print(f"RESULT: {self.nlg.synthesize(path, certainty)}")
        else:
            print("(!) No logical connection discovered in current logic tree.")

if __name__ == "__main__":
    system = LogicSystem()
    print("-----------------------------------------")
    print(" LOGIC ENGINE v1.0 (RocksDB Optimized)   ")
    print("-----------------------------------------")
    print("1. Ingest large file")
    print("2. Enter Query Mode")
    print("3. Exit")
    
    choice = input("\nSelect action [1-3]: ").strip()
    
    if choice == '1':
        filename = input("Enter filename: ").strip()
        system.learn_from_large_file(filename)
    elif choice == '2':
        system.start_repl()
    else:
        print("Exiting.")
