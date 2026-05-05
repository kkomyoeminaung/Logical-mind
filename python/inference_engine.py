# InferenceEngine: For recursive pathfinding.

from collections import deque

class InferenceEngine:
    """
    Logic engine for traversing the SVO tree to find answers or derive new facts.
    """
    def __init__(self, db_handler):
        self.db = db_handler

    def recursive_path(self, start_node, target_node, depth=5):
        """
        Finds the strongest logical connection between two entities using BFS.
        Implements an OR Gate logic by seeking the highest certainty path.
        """
        # Queue stores: (current_node, path_to_node, certainty_score)
        queue = deque([(start_node, [], 1.0)])
        
        # Track the best certainty found so far for each node to allow path optimization
        best_certainties = {start_node: 1.0}
        
        final_path = None
        final_certainty = 0.0

        while queue:
            current, path, certainty = queue.popleft()

            # If we reached the target, check if this path is stronger than what we found
            if current == target_node and path:
                if certainty > final_certainty:
                    final_path = path
                    final_certainty = certainty
                continue # Keep looking for potentially stronger paths

            if len(path) >= depth:
                continue

            # 1. Traversal through Direct Relations
            for verb, obj, weight in self.db.get_relations(current):
                # Fuzzy weight normalization: default scale is 1-100
                step_conf = min(1.0, weight / 100.0) 
                new_certainty = certainty * step_conf
                
                # Only proceed if this path provides a better certainty than previously visited
                if obj not in best_certainties or new_certainty > best_certainties[obj]:
                    best_certainties[obj] = new_certainty
                    queue.append((obj, path + [(current, verb, obj)], new_certainty))
            
            # 2. Traversal through Inheritance (Is-a groups)
            # Child nodes inherit parent properties without losing certainty
            parents = self.db.get_parents(current)
            for parent in parents:
                if parent not in best_certainties or certainty > best_certainties[parent]:
                    best_certainties[parent] = certainty
                    queue.append((parent, path + [(current, "is_a", parent)], certainty))

        return final_path, final_certainty
