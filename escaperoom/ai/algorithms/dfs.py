import time
from ai.state import GameState
from ai.actions import get_all_actions


def dfs(initial_state: GameState):
    """Depth-First Search — memory efficient, not guaranteed optimal."""
    t0 = time.perf_counter()
    actions = get_all_actions()

    frontier  = [(initial_state, [])]
    visited   = {initial_state}      # mark at generation time (same as BFS)
    expanded  = 0
    max_front = 1

    while frontier:
        state, plan = frontier.pop()
        expanded += 1

        if state.is_goal():
            return plan, _stats('DFS', expanded, len(plan), t0, max_front)

        # reversed so first action in list gets explored first
        for a in reversed(actions):
            if a.is_applicable(state):
                ns = a.apply(state)
                if ns not in visited:
                    visited.add(ns)
                    frontier.append((ns, plan + [a]))
                    if len(frontier) > max_front:
                        max_front = len(frontier)

    return None, _stats('DFS', expanded, 0, t0, max_front)


def _stats(algo, expanded, length, t0, max_front):
    return {
        'algorithm':        algo,
        'nodes_expanded':   expanded,
        'plan_length':      length,
        'time_ms':          round((time.perf_counter() - t0) * 1000, 3),
        'max_frontier':     max_front,
    }
