"""
Puzzle configuration data structures.

A PuzzleConfig describes a complete escape-room puzzle as a linear
dependency chain of stages.  Each stage holds:
  - an item to pick up (in some room area)
  - a lock to open with that item (in some room area)

The GA in genetic.py evolves PuzzleConfig objects; the dynamic A* solver
in dynamic_solver.py evaluates each one to measure difficulty.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List

# All traversable areas (mirrors AREA_POS keys in game.js)
AREAS = ['start_area', 'desk_area', 'cabinet_area', 'safe_area', 'exit_area']

# Areas that contain interactable objects (GA can place items here)
PLAY_AREAS = ['desk_area', 'cabinet_area', 'safe_area']


@dataclass
class Stage:
    """One link in the puzzle dependency chain."""
    item_name: str   # collectible item  (e.g. 'key_0', 'master_key')
    item_area: str   # area where the item is found
    lock_name: str   # lock this item is used on (e.g. 'lock_0', 'exit')
    lock_area: str   # area where the lock is located


@dataclass
class PuzzleConfig:
    """
    A complete puzzle configuration produced by the Genetic Algorithm.

    stages[0].item  — freely pickable (no prerequisite)
    stages[i].item  — available only after stages[i-1].lock is opened
    stages[-1].lock — always 'exit' in 'exit_area'
    """
    stages: List[Stage]

    # Filled in by the solver after evaluation
    plan_length:    int   = 0
    nodes_expanded: int   = 0
    solvable:       bool  = False
    fitness:        float = 0.0
    generation:     int   = 0   # GA generation when this config was found

    # ── serialisation ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            'num_stages':     len(self.stages),
            'stages': [
                {
                    'item_name': s.item_name,
                    'item_area': s.item_area,
                    'lock_name': s.lock_name,
                    'lock_area': s.lock_area,
                }
                for s in self.stages
            ],
            'plan_length':    self.plan_length,
            'nodes_expanded': self.nodes_expanded,
            'solvable':       self.solvable,
            'fitness':        round(self.fitness, 2),
            'generation':     self.generation,
        }
