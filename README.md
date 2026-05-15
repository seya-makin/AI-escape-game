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


### Controls
The simulation supports two distinct modes of operation:
* **WASD / Mouse:** Move and look around (Human Mode)
* **Tab:** Toggle between Human and AI mode
* **1 / 2 / 3 / 4:** Select the solving algorithm (BFS, DFS, UCS, A*)
* **E:** Interact with objects (Cabinet, Desk, Safe)
* **R:** Reset the simulation to its initial state
* **Escape:** Quit the application

### AI & Algorithm Comparison
The core of this project is the analysis of different search strategies within a dynamic 3D environment. The agent must solve a sequence of dependencies (finding Key A to unlock Lock A to find Key B) using:
* **Breadth-First Search (BFS):** Guarantees the shortest path but can be memory-intensive.
* **Depth-First Search (DFS):** Explores deeply but may find non-optimal paths.
* **Uniform Cost Search (UCS):** Finds the least-cost path by expanding the lowest-cost nodes.
* **A* Search:** Uses a custom heuristic to find the goal efficiently, significantly reducing the number of nodes expanded compared to uninformed search.

### Procedural Generation
The system includes a **Genetic Algorithm (GA)** accessible via the Flask server. It evolves puzzle configurations by:
1. Generating a population of "chromosomes" representing key-lock placements.
2. Evaluating fitness based on solvability and a target difficulty (step count).
3. Applying crossover and mutation to find the optimal "champion" configuration.

### Technical Documentation
A comprehensive technical report (`report.tex`) is included in this repository. It details the state-space complexity, the mathematical formulation of the GA fitness function, and the performance benchmarks for each search algorithm.

### Credits
Developed at the American University in Dubai for the EECE453 Artificial Intelligence course.
