"""
Generic search solvers (BFS / DFS / UCS / A*) for any PuzzleConfig.

The state space is parameterised by the puzzle configuration, so the same
solver works for 2-stage trivial puzzles and 5-stage hard ones.

State:  (location, frozenset of collected items, frozenset of opened locks)
Goal:   lock 'exit' opened  AND  player at 'exit_area'

Heuristic:
  h = (items not yet collected) + (locks not yet opened) + (not at exit ? 1 : 0)
  Admissible because each action resolves at most one term.
  Consistent because h never increases on a move action (move doesn't change
  collected/unlocked) and decreases by exactly 1 on every productive action.
"""
from __future__ import annotations

import heapq
import time
from collections import deque
from dataclasses import dataclass
from typing import FrozenSet, List, Tuple

from ai.puzzle_config import AREAS, PuzzleConfig


# ── State ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DynState:
    location:  str
    collected: FrozenSet[str]
    unlocked:  FrozenSet[str]

    @staticmethod
    def initial() -> DynState:
        return DynState('start_area', frozenset(), frozenset())

    def is_goal(self) -> bool:
        return 'exit' in self.unlocked and self.location == 'exit_area'


# ── Heuristic ─────────────────────────────────────────────────────────────────

def _h(state: DynState, config: PuzzleConfig) -> int:
    """
    Admissible + consistent heuristic:
      items_still_to_collect + locks_still_to_unlock + (1 if not at exit_area else 0)

    Each productive action (pickup / unlock / move-toward-exit) decreases h by at
    most 1, which is exactly the per-action cost — so A* is guaranteed optimal.
    """
    h = 0
    for stage in config.stages:
        if stage.item_name not in state.collected:
            h += 1
        if stage.lock_name not in state.unlocked:
            h += 1
    if state.location != 'exit_area':
        h += 1
    return h


# ── Action classes (lightweight, use __slots__ for speed) ────────────────────

class _Move:
    __slots__ = ('name', 'dest', 'cost')
    def __init__(self, dest: str):
        self.name = f'move_to_{dest}'
        self.dest = dest
        self.cost = 1.0

    def applicable(self, s: DynState) -> bool:
        return s.location != self.dest

    def apply(self, s: DynState) -> DynState:
        return DynState(self.dest, s.collected, s.unlocked)


class _Pickup:
    __slots__ = ('name', 'item', 'area', 'prereq', 'cost')
    def __init__(self, item: str, area: str, prereq: str | None = None):
        self.name   = f'pick_up_{item}'
        self.item   = item
        self.area   = area
        self.prereq = prereq   # lock that must be open before this item is accessible
        self.cost   = 1.0

    def applicable(self, s: DynState) -> bool:
        return (s.location == self.area
                and self.item not in s.collected
                and (self.prereq is None or self.prereq in s.unlocked))

    def apply(self, s: DynState) -> DynState:
        return DynState(s.location, s.collected | {self.item}, s.unlocked)


class _Unlock:
    __slots__ = ('name', 'lock', 'area', 'requires', 'cost')
    def __init__(self, lock: str, area: str, requires: str):
        self.name     = f'unlock_{lock}'
        self.lock     = lock
        self.area     = area
        self.requires = requires
        self.cost     = 1.0

    def applicable(self, s: DynState) -> bool:
        return (s.location == self.area
                and self.lock not in s.unlocked
                and self.requires in s.collected)

    def apply(self, s: DynState) -> DynState:
        return DynState(s.location, s.collected, s.unlocked | {self.lock})


# ── Action builder ────────────────────────────────────────────────────────────

def _build_actions(config: PuzzleConfig) -> list:
    acts: list = [_Move(a) for a in AREAS]
    for i, stage in enumerate(config.stages):
        prereq = config.stages[i - 1].lock_name if i > 0 else None
        acts.append(_Pickup(stage.item_name, stage.item_area, prereq))
        acts.append(_Unlock(stage.lock_name, stage.lock_area, stage.item_name))
    return acts


# ── Solver ────────────────────────────────────────────────────────────────────

def solve_dynamic(config: PuzzleConfig) -> Tuple[int, int, bool]:
    """
    Run A* on the state space defined by *config*.

    Returns
    -------
    plan_length    : int   — number of actions in the optimal plan (0 if unsolvable)
    nodes_expanded : int   — total nodes popped from the frontier
    solvable       : bool  — True iff a goal state was reached
    """
    actions = _build_actions(config)
    start   = DynState.initial()

    counter  = 0
    h0       = _h(start, config)
    # heap entry: (f, tie-break, g, state, plan_length)
    frontier: list = [(h0, counter, 0.0, start, 0)]
    explored: dict = {}
    expanded = 0

    while frontier:
        f, _, g, state, depth = heapq.heappop(frontier)

        if state in explored and explored[state] <= g:
            continue
        explored[state] = g
        expanded += 1

        if state.is_goal():
            return depth, expanded, True

        for a in actions:
            if a.applicable(state):
                ns = a.apply(state)
                ng = g + a.cost
                if ns not in explored or explored[ns] > ng:
                    counter += 1
                    heapq.heappush(
                        frontier,
                        (ng + _h(ns, config), counter, ng, ns, depth + 1)
                    )

    return 0, expanded, False


# ═══════════════════════════════════════════════════════════════════════════════
#  Full-plan solvers (BFS / DFS / UCS / A*) — return the action list for the UI
# ═══════════════════════════════════════════════════════════════════════════════

def _bfs(start, actions):
    frontier = deque([(start, [])])
    explored = {start}
    expanded = 0
    max_frontier = 1
    while frontier:
        max_frontier = max(max_frontier, len(frontier))
        state, path = frontier.popleft()
        expanded += 1
        if state.is_goal():
            return path, expanded, max_frontier, True
        for a in actions:
            if a.applicable(state):
                ns = a.apply(state)
                if ns not in explored:
                    explored.add(ns)
                    frontier.append((ns, path + [a.name]))
    return [], expanded, max_frontier, False


def _dfs(start, actions, depth_limit=60):
    frontier = [(start, [])]
    explored = {start}
    expanded = 0
    max_frontier = 1
    while frontier:
        max_frontier = max(max_frontier, len(frontier))
        state, path = frontier.pop()
        expanded += 1
        if state.is_goal():
            return path, expanded, max_frontier, True
        if len(path) >= depth_limit:
            continue
        for a in actions:
            if a.applicable(state):
                ns = a.apply(state)
                if ns not in explored:
                    explored.add(ns)
                    frontier.append((ns, path + [a.name]))
    return [], expanded, max_frontier, False


def _ucs(start, actions):
    counter = 0
    frontier = [(0.0, counter, start, [])]
    explored = {start}
    expanded = 0
    max_frontier = 1
    while frontier:
        max_frontier = max(max_frontier, len(frontier))
        g, _, state, path = heapq.heappop(frontier)
        expanded += 1
        if state.is_goal():
            return path, expanded, max_frontier, True
        for a in actions:
            if a.applicable(state):
                ns = a.apply(state)
                if ns not in explored:
                    explored.add(ns)
                    counter += 1
                    heapq.heappush(frontier, (g + a.cost, counter, ns, path + [a.name]))
    return [], expanded, max_frontier, False


def _astar(start, actions, config):
    counter = 0
    frontier = [(_h(start, config), counter, 0.0, start, [])]
    explored = {start}
    expanded = 0
    max_frontier = 1
    while frontier:
        max_frontier = max(max_frontier, len(frontier))
        f, _, g, state, path = heapq.heappop(frontier)
        expanded += 1
        if state.is_goal():
            return path, expanded, max_frontier, True
        for a in actions:
            if a.applicable(state):
                ns = a.apply(state)
                if ns not in explored:
                    explored.add(ns)
                    counter += 1
                    heapq.heappush(frontier,
                        (g + a.cost + _h(ns, config), counter, g + a.cost, ns, path + [a.name]))
    return [], expanded, max_frontier, False


def solve_ga(config: PuzzleConfig, algo: str = 'A*') -> Tuple[List[str], dict, bool]:
    """
    Solve any GA-evolved puzzle config with the chosen classical algorithm.

    Returns
    -------
    plan     : list of action names
    stats    : dict(algorithm, nodes_expanded, plan_length, max_frontier, time_ms)
    solvable : True iff a plan was found
    """
    actions = _build_actions(config)
    start   = DynState.initial()

    t0 = time.perf_counter()
    if algo == 'BFS':
        plan, nodes, max_fr, ok = _bfs(start, actions)
    elif algo == 'DFS':
        plan, nodes, max_fr, ok = _dfs(start, actions)
    elif algo == 'UCS':
        plan, nodes, max_fr, ok = _ucs(start, actions)
    elif algo in ('A*', 'Astar', 'astar'):
        plan, nodes, max_fr, ok = _astar(start, actions, config)
    else:
        raise ValueError(f'Unknown algorithm: {algo}')
    elapsed = round((time.perf_counter() - t0) * 1000, 2)

    stats = {
        'algorithm':      algo,
        'nodes_expanded': nodes,
        'plan_length':    len(plan),
        'max_frontier':   max_fr,
        'time_ms':        elapsed,
    }
    return plan, stats, ok
