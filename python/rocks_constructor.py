# RocksConstructor: For logic integration into RocksDB using rocksdict.
from rocksdict import Rdict, WriteBatch, Options, Config

class RocksConstructor:
    """
    Handles high-performance storage in RocksDB.
    Tuned for billions of keys.
    """
    def __init__(self, db_path="./logic_tree.db"):
        # Optimized options for high-throughput writing and low disk usage
        options = Options()
        options.create_if_missing(True)
        
        # Compression: ZSTD for billion-scale text logic patterns
        options.set_compression_type("zstd") 
        
        # Memory Management for Laptop (RAM < 16GB)
        options.set_write_buffer_size(64 * 1024 * 1024) 
        options.set_max_write_buffer_number(3)
        options.set_target_file_size_base(64 * 1024 * 1024)
        
        self.db = Rdict(db_path, options=options)
        self.batch = WriteBatch()
        self.batch_size = 0
        self.max_batch_threshold = 50000 

    def add_triplet(self, subject, verb, object_, weight=1):
        """
        Stores relations using a persistent batch mechanism.
        """
        key = f"{subject}:{verb}:{object_}"
        # We store the weight as an int. rocksdict handles serialization.
        current_weight = self.db.get(key, 0)
        self.batch.put(key, current_weight + weight)
        self.batch_size += 1
        
        if self.batch_size >= self.max_batch_threshold:
            self.flush()

    def add_isa_relation(self, child, parent):
        key = f"group:{child}:{parent}"
        self.batch.put(key, True)
        self.batch_size += 1

    def flush(self):
        if self.batch_size > 0:
            print(f"Committing batch of {self.batch_size}...")
            self.db.write(self.batch)
            self.batch = WriteBatch()
            self.batch_size = 0

    def get_relations(self, entity):
        """
        Retrieves relations using HIGH-SPEED prefix scanning.
        Uses iterator seek to avoid O(N) full table scans.
        """
        relations = []
        prefix = f"{entity}:"
        
        # O(log N) seek directly to the prefix region
        it = self.db.iter()
        it.seek(prefix)
        
        # Iterate only until the prefix mismatch
        for key, weight in it:
            key_str = str(key)
            if not key_str.startswith(prefix):
                break
                
            parts = key_str.split(':')
            if len(parts) == 3:
                relations.append((parts[1], parts[2], weight))
        
        return relations

    def get_parents(self, entity):
        """
        Retrieves all parent groups this entity belongs to via inheritance indexing.
        """
        parents = []
        prefix = f"group:{entity}:"
        it = self.db.iter()
        it.seek(prefix)
        for key, _ in it:
            key_str = str(key)
            if not key_str.startswith(prefix):
                break
            parts = key_str.split(':')
            if len(parts) == 3:
                parents.append(parts[2])
        return parents

    def close(self):
        self.flush()
        self.db.close()
