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
        self._pending = {}

    def add_triplet(self, subject, verb, object_, weight=1):
        """
        Stores relations using a persistent batch mechanism.
        """
        key = f"r:{subject}:{verb}:{object_}"
        # Track pending directly with pending buffer for uncommitted writes
        current = self._pending.get(key, self.db.get(key, 0))
        self._pending[key] = current + weight
        self.batch.put(key, current + weight)
        self.batch_size += 1
        
        if self.batch_size >= self.max_batch_threshold:
            self.flush()

    def add_isa_relation(self, child, parent):
        key = f"g:{child}:{parent}"
        self.batch.put(key, True)
        self.batch_size += 1

    def flush(self):
        if self.batch_size > 0:
            print(f"Committing batch of {self.batch_size}...")
            self.db.write(self.batch)
            self.batch = WriteBatch()
            self.batch_size = 0
            self._pending.clear()

    def get_relations(self, entity):
        """
        Retrieves relations using HIGH-SPEED prefix scanning.
        Uses iterator seek to avoid O(N) full table scans.
        """
        relations = []
        prefix = f"r:{entity}:"
        
        # O(log N) seek directly to the prefix region
        it = self.db.iter()
        it.seek(prefix.encode('utf-8') if hasattr(prefix, 'encode') else prefix)
        
        # Iterate only until the prefix mismatch
        for key, weight in it:
            if isinstance(key, bytes):
                key_str = key.decode('utf-8')
            else:
                key_str = str(key)
                
            if not key_str.startswith(prefix):
                break
                
            parts = key_str.split(':')
            if len(parts) == 4:
                relations.append((parts[2], parts[3], weight))
        
        return relations

    def get_parents(self, entity):
        """
        Retrieves all parent groups this entity belongs to via inheritance indexing.
        """
        parents = []
        prefix = f"g:{entity}:"
        it = self.db.iter()
        it.seek(prefix.encode('utf-8') if hasattr(prefix, 'encode') else prefix)
        
        for key, _ in it:
            if isinstance(key, bytes):
                key_str = key.decode('utf-8')
            else:
                key_str = str(key)
                
            if not key_str.startswith(prefix):
                break
            parts = key_str.split(':')
            if len(parts) == 3:
                parents.append(parts[2])
        return parents

    def close(self):
        if self.batch_size > 0:
            print(f"⚠️ Flushing remaining {self.batch_size} uncommitted records...")
            self.flush()
        self.db.close()
        print("✅ RocksDB closed safely.")

    def __enter__(self): return self
    def __exit__(self, exc_type, exc_val, exc_tb): self.close()
