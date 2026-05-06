from main import LogicSystem
import os

def run_test():
    print("Initializing test...")
    # Clean up old DB if exists
    db_path = "./test_logic.db"
    if os.path.exists(db_path):
        import shutil
        shutil.rmtree(db_path)

    system = LogicSystem()
    system.db = system.db.__class__(db_path) # Direct override for test
    system.engine = system.engine.__class__(system.db) # Rebind engine too
    
    print("\n[Step 1] Learning facts...")
    # Direct injection for testing
    system.db.add_triplet("cat", "eats", "fish", weight=10)
    system.db.add_triplet("fish", "lives_in", "water", weight=5)
    system.db.add_isa_relation("dog", "animal")
    system.db.add_triplet("animal", "breathes", "air", weight=10)
    system.db.flush()

    print("\n[Step 2] Testing Recursive Inference (A -> B -> C)...")
    print("Query: cat -> water")
    system.run_query("cat", "water")

    print("\n[Step 3] Testing Inheritance (Dog -> Animal -> Air)...")
    print("Query: dog -> air")
    system.run_query("dog", "air")

    print("\n[Step 4] Testing Contradiction (Branching Logic)...")
    system.db.add_triplet("fire", "is", "hot", weight=10)
    system.db.add_triplet("fire", "is", "cold", weight=1) # Rare contradiction
    system.db.flush()
    print("Query: fire -> hot")
    system.run_query("fire", "hot")
    print("Query: fire -> cold")
    system.run_query("fire", "cold")

    print("\nTest completed.")

if __name__ == "__main__":
    run_test()
