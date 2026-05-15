# Escape Room AI

A hybrid artificial intelligence system that combines classical search algorithms with genetic algorithms to generate and solve 3D escape room puzzles. This project explores the intersection of procedural content generation and automated problem solving.

### Project Overview
The application features a 3D environment built with the Ursina engine. Players or AI agents navigate through distinct zones—the Cabinet, Desk, Safe, and Exit—to locate keys and unlock a sequence of barriers to escape.

### Key Components
* **Genetic Algorithm (GA):** Evolved puzzle configurations based on specific difficulty targets (Easy, Medium, Hard). The GA optimizes for "solvability" and "fitness," ensuring every generated room is a challenge but possible to complete.
* **Classical Search Algorithms:** Implements and compares multiple pathfinding strategies:
    * Breadth-First Search (BFS)
    * Depth-First Search (DFS)
    * Uniform Cost Search (UCS)
    * A* Search (using custom heuristics for optimal 20-step plans)
* **3D Simulation:** A real-time interactive game engine that allows for manual human play or automated AI execution.

### Technical Stack
* **Language:** Python
* **Graphics Engine:** Ursina 
* **Backend:** Flask (API for generating and solving puzzles)
* **Documentation:** LaTeX (Comprehensive technical report included)

### How to Run
1. **Install requirements:**
   ```bash
   pip install -r requirements.txt
